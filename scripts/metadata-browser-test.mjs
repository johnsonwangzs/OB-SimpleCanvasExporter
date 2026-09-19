import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

await mkdir('qa/metadata',{recursive:true});
const stub=await readFile('scripts/fixtures/obsidian-modal.mjs','utf8');
await build({stdin:{contents:`export {ExportModal} from './src/main';export {exportCanvas} from './src/export';export {exportMetadata} from './src/metadata';export {viewerToolbar} from './src/viewer-html';export {viewerCSS} from './src/styles';export {startViewer} from './src/viewer';export {EN,ZH} from './src/i18n';export {TextFileView} from 'obsidian';`,resolveDir:process.cwd()},outfile:'qa/metadata/runtime.js',bundle:true,format:'iife',globalName:'metadataTest',target:'es2022',minifySyntax:true,define:{__QA__:'false',__QA_EDGES_ONLY__:'false'},plugins:[{name:'modal-adapter',setup(b){
  b.onResolve({filter:/^(obsidian|electron)$/},args=>({path:args.path,namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='obsidian'?stub:'export const shell={openPath:async()=>""};'}));
}}]});
const pluginCSS=await readFile('styles.css','utf8');
await writeFile('qa/metadata/modal.html',`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px/1.5 system-ui;background:#eee;color:#222;margin:0;--text-muted:#666;--font-ui-small:12px}.modal{box-sizing:border-box;background:white;padding:24px;margin:12px auto}.setting-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 0;border-bottom:1px solid #ddd}.setting-item-info{flex:1}.setting-item-control{display:flex;align-items:center;gap:8px;flex-shrink:0}.setting-item-description{font-size:12px;color:#666}.setting-item-control input{box-sizing:border-box;min-width:0;width:200px}button,input{font:inherit;padding:6px}h2{font-size:20px;margin-top:0}${pluginCSS}</style></head><body></body></html>`);
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const errors=[],requests=[],summary={};
const watch=page=>{page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});};
const url=file=>pathToFileURL(resolve(`qa/metadata/${file}.html`)).href;
const runtime=resolve('qa/metadata/runtime.js');
const ready=page=>page.waitForFunction(()=>document.querySelector('.sce-interactive'));
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function modal(page,{language='zh',fail=false}={}){
  await page.goto(url('modal'));await page.addScriptTag({path:runtime});
  await page.evaluate(({language,fail})=>{
    window.testLanguage=language;window.saved=[];window.failSave=fail;window.pendingSave=undefined;
    const app={vault:{adapter:{exists:async()=>false},createFolder:async()=>{},create:async(path,html)=>{
      await new Promise(resolve=>{window.pendingSave=resolve;});
      if(window.failSave)throw Error('Simulated write failure');window.saved.push({path,html});return{};
    }}};
    const view=new metadataTest.TextFileView();view.getViewType=()=> 'canvas';view.getViewData=()=>JSON.stringify({nodes:[],edges:[]});view.file={path:'notes/original.canvas',basename:'original'};view.containerEl=document.body;
    window.exportModal=new metadataTest.ExportModal(app,view,()=>{},{initial:{defaults:null},save:async defaults=>({defaults})});window.exportModal.open();
  },{language,fail});
}
async function finish(page){await page.waitForFunction(()=>typeof window.pendingSave==='function');await page.evaluate(()=>{const resolve=window.pendingSave;window.pendingSave=undefined;resolve();});}
try{
  const context=await browser.newContext({viewport:{width:1360,height:900},timezoneId:'Asia/Shanghai',offline:true});
  const page=await context.newPage();watch(page);await page.clock.setFixedTime(new Date('2026-09-18T02:03:04Z'));
  await modal(page);
  assert.equal(await page.getByRole('textbox',{name:'页面标题',exact:true}).inputValue(),'original');
  assert.ok(await page.getByRole('textbox',{name:'作者',exact:true}).isDisabled());
  assert.equal(await page.getByRole('switch',{name:'显示作者',exact:true}).getAttribute('aria-checked'),'false');
  assert.equal(await page.getByRole('switch',{name:'显示导出时间',exact:true}).getAttribute('aria-checked'),'false');
  await page.getByRole('textbox',{name:'页面标题',exact:true}).fill('研究方法总览');
  await page.getByRole('switch',{name:'显示作者',exact:true}).click();await page.getByRole('textbox',{name:'作者',exact:true}).fill('Meowdichlorian');
  await page.getByRole('switch',{name:'显示导出时间',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'保存位置',exact:true}).inputValue(),'notes/original.html');
  await page.screenshot({path:'qa/metadata/modal-adapter.png'});
  await page.getByRole('button',{name:'导出',exact:true}).click();await page.waitForFunction(()=>typeof window.pendingSave==='function'||!document.querySelector('.mod-cta').disabled);
  assert.equal(await page.evaluate(()=>typeof window.pendingSave),'function',await page.locator('.sce-export-status').textContent());
  assert.equal(await page.locator('.setting-item input:not(:disabled),.setting-item button:not(:disabled)').count(),0);
  // The timestamp belongs to the start, even when writing takes time.
  await page.clock.setFixedTime(new Date('2026-09-18T02:13:04Z'));await finish(page);
  await page.waitForFunction(()=>window.saved.length===1);assert.ok(await page.getByRole('button',{name:'导出',exact:true}).isHidden());
  const saved=await page.evaluate(()=>window.saved[0]);assert.equal(saved.path,'notes/original.html');
  await writeFile('qa/metadata/production.html',saved.html);await page.goto(url('production'));await ready(page);
  assert.equal(await page.title(),'研究方法总览');assert.equal(await page.locator('.sce-title').textContent(),'研究方法总览');assert.equal(await page.locator('.sce-viewport').getAttribute('aria-label'),'研究方法总览');
  assert.equal(await page.locator('.sce-author').textContent(),'作者: Meowdichlorian');assert.equal(await page.locator('.sce-export-time').textContent(),'Export time: 2026-09-18 10:03');
  assert.equal(await page.locator('.sce-export-time').getAttribute('datetime'),'2026-09-18T02:03:04.000Z');assert.match(await page.locator('.sce-export-time').getAttribute('title'),/10:03:04 UTC\+08:00/);
  summary.modalThroughRealExporter=true;

  const other=await browser.newContext({timezoneId:'America/New_York',offline:true}),reopened=await other.newPage();watch(reopened);
  await reopened.clock.setFixedTime(new Date('2030-01-01T00:00:00Z'));await reopened.goto(url('production'));await ready(reopened);
  assert.equal(await reopened.locator('.sce-export-time').textContent(),'Export time: 2026-09-18 10:03');assert.match(await reopened.locator('.sce-export-time').getAttribute('title'),/UTC\+08:00/);await other.close();
  summary.timeIsFrozenAcrossReopenAndTimezones=true;

  // Test retries, invalid paths, and restoring editable fields, using the actual modal handlers.
  await modal(page,{fail:true});await page.getByRole('textbox',{name:'保存位置',exact:true}).fill('../bad.html');await page.getByRole('button',{name:'导出',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.pendingSave),undefined);assert.ok(await page.getByRole('textbox',{name:'页面标题',exact:true}).isEnabled());
  await page.getByRole('textbox',{name:'保存位置',exact:true}).fill('original.html');await page.getByRole('textbox',{name:'页面标题',exact:true}).fill('   ');
  await page.getByRole('button',{name:'导出',exact:true}).click();await finish(page);await page.waitForFunction(()=>document.querySelector('.sce-export-status').textContent.includes('Simulated write failure'));
  assert.ok(await page.getByRole('textbox',{name:'页面标题',exact:true}).isEnabled());assert.ok(await page.getByRole('textbox',{name:'作者',exact:true}).isDisabled());
  await page.evaluate(()=>window.failSave=false);await page.getByRole('button',{name:'导出',exact:true}).click();await finish(page);await page.waitForFunction(()=>window.saved.length===1);
  const fallback=await page.evaluate(()=>{const doc=new DOMParser().parseFromString(window.saved[0].html,'text/html');return{title:doc.title,metadata:doc.querySelectorAll('.sce-author,.sce-export-time').length};});
  assert.deepEqual(fallback,{title:'original',metadata:0});summary.retryValidationAndDefaults=true;

  await modal(page,{language:'en'});await page.getByRole('switch',{name:'Show author',exact:true}).click();await page.getByRole('textbox',{name:'Author',exact:true}).fill('Hidden author');await page.getByRole('switch',{name:'Show author',exact:true}).click();
  await page.getByRole('switch',{name:'Show export time',exact:true}).click();await page.getByRole('button',{name:'Export',exact:true}).click();await finish(page);await page.waitForFunction(()=>window.saved.length===1);
  assert.ok(!await page.evaluate(()=>window.saved[0].html.includes('Hidden author')));summary.englishAndDisabledAuthorOmission=true;

  // Generate through the production assembler, using multiple option combinations and untrusted text.
  const variants=await page.evaluate(async()=>{
    const result={},snap={document,data:{nodes:[],edges:[],warnings:[]},file:{basename:'Fallback Canvas',path:'fallback.canvas'}};
    const hostile='</title><script>globalThis.injected=1</script><img src=x onerror="globalThis.injected=1"> & 中文';
    for(const [name,options] of Object.entries({author:{title:'标题',showAuthor:true,author:'Alice & Bob'},time:{title:'标题',showTime:true},blank:{title:'',showAuthor:true,author:'   '},hostile:{title:hostile,showAuthor:true,author:hostile,showTime:true}})){
      result[name]=(await metadataTest.exportCanvas({},snap,metadataTest.ZH,new AbortController().signal,undefined,options)).html;
    }
    return {result,hostile};
  });
  for(const [name,html] of Object.entries(variants.result))await writeFile(`qa/metadata/${name}.html`,html);
  await page.goto(url('hostile'));await ready(page);assert.equal(await page.title(),variants.hostile);assert.equal(await page.locator('.sce-title').textContent(),variants.hostile);assert.equal(await page.locator('.sce-author').textContent(),'作者: '+variants.hostile);assert.equal(await page.evaluate(()=>window.injected),undefined);assert.equal(await page.locator('.sce-title-line img,.sce-title-line script').count(),0);
  for(const [name,counts] of [['author',[1,0]],['time',[0,1]],['blank',[0,0]]]){await page.goto(url(name));await ready(page);assert.deepEqual([await page.locator('.sce-author').count(),await page.locator('.sce-export-time').count()],counts);}
  summary.independentOptionsAndEscaping=true;

  // Verify the same-line header under all languages/themes with actual card interactions below it.
  await modal(page);
  const layouts=await page.evaluate(()=>{
    const {exportMetadata,viewerToolbar,viewerCSS,startViewer,EN,ZH}=metadataTest;
    return [false,true].flatMap(dark=>[false,true].map(english=>{
      const s=english?EN:ZH,title=english?'A long research overview: '.repeat(8):'研究方法与实验结果总览'.repeat(12),metadata=exportMetadata(title,{showAuthor:true,author:'Meowdichlorian 与研究团队 '.repeat(10),showTime:true},new Date('2026-09-18T02:03:04Z'));
      return {name:`${dark?'dark':'light'}-${english?'en':'zh'}`,html:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${viewerCSS}body{--sce-bg:${dark?'#202024':'#fff'};--sce-text:${dark?'#eee':'#222'};--sce-border:${dark?'#555':'#ccc'};--sce-hover:${dark?'#333':'#f4f4f4'};--sce-accent:#9878d6;color-scheme:${dark?'dark':'light'}}</style></head><body data-sce-export-id="layout">${viewerToolbar(s,title,1,0,metadata)}<main class="sce-viewport" tabindex="0"><div class="sce-scene" data-width="600" data-height="500" style="width:600px;height:500px"><article class="sce-card" data-node-id="a" data-node-type="text" style="left:20px;top:20px;width:400px;height:250px;border:1px solid var(--sce-border)"><div class="sce-card-scroll"><div class="sce-render-sizer"><p>needle</p><span class="badge badge-green">Topic</span>${'<p>Long content for reading.</p>'.repeat(40)}</div></div></article></div></main><script>(${startViewer.toString()})(${JSON.stringify(s.searchCurrent)});</script></body></html>`};
    }));
  });
  for(const {name,html} of layouts){
    await writeFile(`qa/metadata/${name}.html`,html);await page.goto(url(name));await ready(page);
    for(const width of [1360,900,650,320]){
      await page.setViewportSize({width,height:900});await settle(page);
      const bounds=await page.locator('.sce-title-line').evaluate(el=>{const rect=el.getBoundingClientRect(),parts=Array.from(el.children,e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,scroll:e.scrollWidth,client:e.clientWidth};});return{width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,rect:{left:rect.left,right:rect.right},parts};});
      assert.equal(bounds.overflow,false);assert.ok(bounds.rect.left>=0&&bounds.rect.right<=width);
      const [title,author,time]=bounds.parts;assert.ok(title.width>=39);assert.ok(author.width>0);assert.ok(time.left>=author.right&&author.left>=title.right);assert.ok(Math.max(...bounds.parts.map(p=>p.top))<Math.min(...bounds.parts.map(p=>p.bottom)));assert.ok(time.scroll<=time.client+1);
      assert.ok(await page.locator('.sce-viewport').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.sce-toolbar').getBoundingClientRect().bottom-1));
      await page.screenshot({path:`qa/metadata/${name}-${width}.png`});
    }
    await page.locator('.sce-search-input input').fill('needle');await page.waitForFunction(()=>document.querySelectorAll('.sce-search-match').length===1);
    await page.locator('[data-reader-node=a] button').evaluate(el=>el.focus({preventScroll:true}));await page.keyboard.press('Enter');assert.ok(await page.locator('.sce-reader').isVisible());
    const titleBefore=await page.locator('.sce-title-line').textContent();await page.locator('.sce-background-trigger').click();await page.locator('.sce-background-preset[data-color="#F5F1E8"]').click();assert.equal(await page.locator('.sce-title-line').textContent(),titleBefore);
    await page.emulateMedia({media:'print'});assert.ok(await page.locator('.sce-toolbar').isHidden());await page.emulateMedia({media:'screen'});
  }
  summary.singleLineResponsiveThemesAndViewerIntegration=true;
  const staticContext=await browser.newContext({javaScriptEnabled:false,offline:true}),sp=await staticContext.newPage();await sp.goto(url('production'));assert.equal(await sp.locator('.sce-title').textContent(),'研究方法总览');assert.equal(await sp.locator('.sce-export-time').textContent(),'Export time: 2026-09-18 10:03');await staticContext.close();summary.staticMetadata=true;
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile('qa/metadata/results.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}finally{await browser.close();}
