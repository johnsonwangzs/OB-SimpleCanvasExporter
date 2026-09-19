import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

await mkdir('qa/watermark',{recursive:true});
const stub=await readFile('scripts/fixtures/obsidian-modal.mjs','utf8');
await build({stdin:{contents:`export {ExportModal} from './src/main';export {exportCanvas} from './src/export';export {EN,ZH} from './src/i18n';export {TextFileView} from 'obsidian';export {watermarkInk} from './src/watermark';`,resolveDir:process.cwd()},outfile:'qa/watermark/runtime.js',bundle:true,format:'iife',globalName:'wmTest',target:'es2022',minifySyntax:true,define:{__QA__:'false'},plugins:[{name:'modal-adapter',setup(b){
  b.onResolve({filter:/^(obsidian|electron)$/},args=>({path:args.path,namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='obsidian'?stub:'export const shell={openPath:async()=>""};'}));
}}]});
const css=await readFile('styles.css','utf8');
await writeFile('qa/watermark/modal.html',`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px/1.5 system-ui;margin:0;background:#fff;color:#222;--text-muted:#666;--text-normal:#222;--text-error:#b00;--font-ui-small:12px;--background-primary:#fff;--background-modifier-border:#ddd}.modal{box-sizing:border-box;background:white;padding:20px;margin:8px auto}.setting-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #ddd}.setting-item-info{flex:1}.setting-item-control{display:flex;align-items:center;gap:8px;flex-shrink:0}.setting-item-description{font-size:12px;color:#666}.setting-item-control input{box-sizing:border-box;min-width:0;width:200px}button,input{font:inherit;padding:6px}h2{font-size:20px;margin-top:0}${css}</style><body></body></html>`);
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const errors=[],requests=[],summary={};
const url=file=>pathToFileURL(resolve(`qa/watermark/${file}.html`)).href;
const watch=page=>{page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});};
const ready=page=>page.waitForFunction(()=>document.querySelector('.sce-interactive'));
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function modal(page,language='zh'){
  await page.goto(url('modal'));await page.addScriptTag({path:resolve('qa/watermark/runtime.js')});
  await page.evaluate(language=>{
    window.testLanguage=language;window.saved=[];window.pendingSave=undefined;window.failSave=false;
    const app={vault:{adapter:{exists:async()=>false},createFolder:async()=>{},create:async(path,html)=>{
      await new Promise(resolve=>{window.pendingSave=resolve;});if(window.failSave)throw Error('Simulated write failure');window.saved.push({path,html});
    }}};
    const view=new wmTest.TextFileView();view.getViewType=()=> 'canvas';view.getViewData=()=>JSON.stringify({nodes:[],edges:[]});view.file={path:'sample.canvas',basename:'sample'};view.containerEl=document.body;
    new wmTest.ExportModal(app,view,()=>{},{initial:{defaults:null},save:async defaults=>({defaults})}).open();
  },language);
}
async function finish(page){await page.waitForFunction(()=>typeof window.pendingSave==='function');await page.evaluate(()=>{window.pendingSave();window.pendingSave=undefined;});}
async function preset(page,color){if(await page.locator('.sce-background-popup').isHidden())await page.locator('.sce-background-trigger').click();await page.locator(`[data-color="${color}"]`).click();}
const ink=page=>page.locator('.sce-watermark').evaluate(el=>getComputedStyle(el).color);
try{
  const context=await browser.newContext({viewport:{width:1360,height:900},offline:true}),page=await context.newPage();watch(page);
  await modal(page);
  assert.equal(await page.getByRole('switch',{name:'背景水印',exact:true}).getAttribute('aria-checked'),'false');
  assert.ok(await page.locator('.sce-watermark-fields').isHidden());
  await page.getByRole('switch',{name:'背景水印',exact:true}).click();
  await page.getByRole('button',{name:'导出',exact:true}).click();assert.equal(await page.locator('.sce-watermark-error').textContent(),'请输入水印文字。');
  assert.equal(await page.evaluate(()=>window.pendingSave),undefined);
  await page.locator('.sce-watermark-text').fill('中'.repeat(41));await page.getByRole('button',{name:'导出',exact:true}).click();assert.match(await page.locator('.sce-watermark-error').textContent(),/40/);
  await page.locator('.sce-watermark-text').fill('项目资料 · 仅供交流');
  assert.ok(await page.locator('.sce-watermark-error').isHidden());
  await page.getByRole('slider',{name:'不透明度'}).fill('12');
  assert.equal(await page.locator('.sce-watermark-preview g').getAttribute('fill-opacity'),'0.12');
  for(const width of [1360,650,320]){await page.setViewportSize({width,height:1100});await page.screenshot({path:`qa/watermark/modal-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.getByRole('button',{name:'导出',exact:true}).click();await page.waitForFunction(()=>typeof window.pendingSave==='function');
  assert.equal(await page.locator('.setting-item input:not(:disabled),.setting-item button:not(:disabled)').count(),0);
  // A programmatic late input must not mutate the independent export snapshot.
  await page.locator('.sce-watermark-text').evaluate(el=>{el.value='Changed while saving';el.dispatchEvent(new Event('input'));});
  await finish(page);await page.waitForFunction(()=>window.saved.length===1);
  const production=await page.evaluate(()=>window.saved[0].html);await writeFile('qa/watermark/production.html',production);
  await page.goto(url('production'));await ready(page);
  assert.equal(await page.locator('.sce-watermark text').first().textContent(),'项目资料 · 仅供交流');assert.equal(await page.locator('.sce-watermark g').getAttribute('fill-opacity'),'0.12');
  assert.equal(await page.locator('.sce-watermark').getAttribute('aria-hidden'),'true');
  assert.equal(await page.locator('meta[name=generator]').getAttribute('content'),`Simple Canvas Exporter ${JSON.parse(await readFile('manifest.json','utf8')).version}`);
  summary.dialogValidationPreviewSnapshotAndExport=true;

  await modal(page,'en');await page.getByRole('switch',{name:'Background watermark',exact:true}).click();await page.locator('.sce-watermark-text').fill('Private draft');
  await page.evaluate(()=>window.failSave=true);await page.getByRole('button',{name:'Export',exact:true}).click();await finish(page);await page.waitForFunction(()=>document.querySelector('.sce-export-status').textContent.includes('Simulated write failure'));
  assert.ok(await page.locator('.sce-watermark-text').isEnabled());assert.ok(await page.getByRole('slider',{name:'Opacity'}).isEnabled());
  await page.getByRole('switch',{name:'Background watermark',exact:true}).click();await page.evaluate(()=>window.failSave=false);
  await page.getByRole('button',{name:'Export',exact:true}).click();await finish(page);await page.waitForFunction(()=>window.saved.length===1);
  const disabled=await page.evaluate(()=>window.saved[0].html);assert.ok(!disabled.includes('Private draft'));assert.ok(!disabled.includes('<svg class="sce-watermark"'));summary.retryEnglishAndDisabledOmission=true;

  await modal(page);
  const generated=await page.evaluate(async()=>{
    const snap={document,data:{nodes:[],edges:[],warnings:[]},file:{basename:'test',path:'test.canvas'}};
    const render=async text=>(await wmTest.exportCanvas({},snap,wmTest.ZH,new AbortController().signal,()=>{},{watermark:{enabled:true,text}})).html;
    const hostile=await render('<>&"\'中文</text><script>x</script>');
    const long=await render('𠮷'.repeat(40));
    const sampleDocument={createElement(){throw Error('Canvas unavailable');},body:document.body};
    if(wmTest.watermarkInk('#123',sampleDocument,'#ffffff')!=='#ffffff')throw Error('Lost the original fallback ink');
    let validation='';try{await render(' ');}catch(e){validation=e.message;}
    document.body.classList.add('theme-dark');document.body.style.backgroundColor='#1e1e1e';document.body.style.color='#eeeeee';
    const dark=await render('项目资料 · 仅供交流');return {hostile,long,dark,validation};
  });
  assert.equal(generated.validation,'请输入水印文字。');
  for(const name of ['hostile','long','dark'])await writeFile(`qa/watermark/${name}.html`,generated[name]);
  await page.goto(url('hostile'));await ready(page);assert.equal(await page.locator('.sce-watermark text').first().textContent(),'<>&"\'中文</text><script>x</script>');assert.equal(await page.locator('.sce-watermark script,.sce-watermark image').count(),0);
  await page.goto(url('long'));await ready(page);assert.ok(Number(await page.locator('.sce-watermark pattern').getAttribute('width'))>720);
  const bounds=await page.locator('.sce-watermark text').nth(0).evaluate(el=>{const b=el.getBBox(),m=el.transform.baseVal.consolidate().matrix;const p=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));return {minX:Math.min(...p.map(p=>p.x)),minY:Math.min(...p.map(p=>p.y)),maxX:Math.max(...p.map(p=>p.x)),maxY:Math.max(...p.map(p=>p.y)),w:Number(el.closest('pattern').getAttribute('width'))/2,h:Number(el.closest('pattern').getAttribute('height'))/2};});
  assert.ok(bounds.minX>0&&bounds.minY>0&&bounds.maxX<bounds.w&&bounds.maxY<bounds.h);summary.escapingUnicodeLongTextAndAssemblerValidation=true;

  const cards=`<div class="sce-groups"><div class="sce-group" data-node-id="g" style="left:10px;top:10px;width:1040px;height:640px;border:2px solid #777;background:rgba(80,140,100,.08)">Group</div></div><svg class="sce-edges"><path data-edge-id="ab" data-from-node="a" data-to-node="b" d="M 390 180 L 540 180" stroke="#888" stroke-width="2"/></svg>${['a','b'].map((id,i)=>`<article class="sce-card" data-node-id="${id}" data-node-type="text" style="left:${40+i*500}px;top:50px;width:350px;height:260px;z-index:${i+2};background:${i?'rgba(80,140,100,.12)':'var(--sce-bg)'};border:1px solid #888;border-radius:8px"><div class="sce-card-scroll"><div class="sce-render-sizer" style="padding:18px"><h2>${id==='a'?'项目概览':'下一步'}</h2><p>${id==='a'?'needle':'other'} content</p><span class="badge badge-green" style="background:#d8efdb;color:#287044">Topic</span>${'<p>Long content to scroll and read.</p>'.repeat(30)}</div></div></article>`).join('')}`;
  const fixture=source=>source.replace(/--sce-static-width:[^;]+;--sce-static-height:[^"]+/,'--sce-static-width:1100px;--sce-static-height:1800px').replace(/<div class="sce-scene"[\s\S]*?<\/main>/,`<div class="sce-scene" data-width="1100" data-height="1800" style="width:1100px;height:1800px">${cards}</div></main>`);
  await writeFile('qa/watermark/fixture.html',fixture(production));await writeFile('qa/watermark/dark-fixture.html',fixture(generated.dark));
  for(const name of ['fixture','dark-fixture']){
    await page.setViewportSize({width:1360,height:900});await page.goto(url(name));await ready(page);
    assert.equal(await ink(page),name==='fixture'?'rgb(0, 0, 0)':'rgb(255, 255, 255)');
    await page.locator('[data-action=reset]').click();
    const patternBefore=await page.locator('.sce-watermark pattern').getAttribute('width');
    await page.locator('[data-action=in]').click();assert.equal(await page.locator('.sce-watermark pattern').getAttribute('width'),patternBefore);
    assert.equal(await page.locator('.sce-watermark').evaluate(el=>getComputedStyle(el).transform),'none');
    const before=await page.locator('.sce-scene').getAttribute('style');
    const v=await page.locator('.sce-viewport').boundingBox();await page.mouse.move(v.x+v.width-60,v.y+v.height-100);await page.mouse.down();await page.mouse.move(v.x+v.width-110,v.y+v.height-150);await page.mouse.up();assert.notEqual(await page.locator('.sce-scene').getAttribute('style'),before);
    await page.locator('.sce-search-input input').fill('仅供交流');await page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');assert.equal(await page.locator('.sce-search-match').count(),0);
    await page.locator('.sce-search-input input').fill('needle');await page.waitForFunction(()=>document.querySelectorAll('.sce-search-match').length===1);
    await page.locator('.sce-badge-chips button').click();assert.equal(await page.locator('.sce-badge-chips button').count(),1);
    await page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');
    await page.locator('[data-reader-node=a] button').evaluate(el=>el.focus({preventScroll:true}));await page.keyboard.press('Enter');assert.ok(await page.locator('.sce-reader').isVisible());
    await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop=130);await page.locator('.sce-card-scroll').first().evaluate(el=>el.scrollTop=100);
    const state=()=>page.evaluate(()=>({transform:document.querySelector('.sce-scene').style.transform,reader:document.querySelector('.sce-reader-body').scrollTop,card:document.querySelector('.sce-card-scroll').scrollTop,html:document.querySelector('.sce-card').innerHTML,search:document.querySelector('.sce-search-status').textContent}));
    const unchanged=await state();
    for(const [color,expected] of [['#1E1E1E','rgb(255, 255, 255)'],['#FFFFFF','rgb(0, 0, 0)'],['#F5F1E8','rgb(0, 0, 0)'],['#202631','rgb(255, 255, 255)']]){await preset(page,color);assert.equal(await ink(page),expected);assert.deepEqual(await state(),unchanged);}
    await page.locator('.sce-background-picker').evaluate(el=>{el.value='#ffffff';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await ink(page),'rgb(0, 0, 0)');
    await page.locator('.sce-background-hex').fill('#111');await page.locator('.sce-background-hex').press('Enter');assert.equal(await ink(page),'rgb(255, 255, 255)');
    await page.reload();await ready(page);assert.equal(await ink(page),'rgb(255, 255, 255)');
    await page.locator('.sce-background-trigger').click();await page.locator('.sce-background-reset').click();assert.equal(await ink(page),name==='fixture'?'rgb(0, 0, 0)':'rgb(255, 255, 255)');
    await page.locator('.sce-background-close').click();await page.locator('[data-action=reset]').click();
    await page.locator('.sce-search-input input').fill('needle');await page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');await page.locator('[data-search-action=next]').click();await page.locator('.sce-search-input input').fill('');await page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');
    for(const width of [1360,650,320]){await page.setViewportSize({width,height:900});await settle(page);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const cover=await page.locator('.sce-watermark').evaluate(el=>({width:el.getBoundingClientRect().width,parent:el.parentElement.clientWidth}));assert.equal(cover.width,cover.parent);await page.screenshot({path:`qa/watermark/${name}-${width}.png`});}
  }
  summary.themesResponsiveBackgroundPersistencePanZoomSearchBadgesReader=true;
  // Derived fixtures reuse actual frozen Obsidian content with this release's viewer.
  // They do not stand in for a fresh export from the running Obsidian application.
  for(const [i,file] of ['qa/default-after/production-export.html','qa/prism-after/production-export.html','qa/groups/qa-groups.html'].entries()){
    let source;try{source=await readFile(file,'utf8');}catch{continue;}
    const derived=await page.evaluate(({source,production})=>{
      const doc=new DOMParser().parseFromString(source,'text/html'),current=new DOMParser().parseFromString(production,'text/html');
      doc.querySelectorAll('.sce-toolbar,.sce-background-popup,.sce-badge-popup,.sce-reader').forEach(el=>el.remove());
      for(const el of Array.from(current.body.children)){if(el.matches('.sce-viewport'))break;doc.body.insertBefore(el.cloneNode(true),doc.querySelector('.sce-viewport'));}
      doc.querySelector('.sce-count').textContent=`${doc.querySelectorAll('.sce-card').length} 张卡片 · ${doc.querySelectorAll('.sce-group').length} 个分组 · ${doc.querySelectorAll('[data-edge-id]').length} 条连接`;
      const css=current.querySelector('style').textContent.split(/(?=\.sce-s\d+\{)/)[0];
      const banks=Array.from(doc.querySelectorAll('style'),el=>{const text=el.textContent,index=text.search(/\.sce-s\d+\{/);el.remove();return index<0?'':text.slice(index);});
      const style=doc.createElement('style');style.textContent=css+banks.join('\n');doc.head.appendChild(style);
      const viewport=doc.querySelector('.sce-viewport'),scene=doc.querySelector('.sce-scene');viewport.classList.add('sce-watermarked');viewport.style.setProperty('--sce-static-width',scene.dataset.width+'px');viewport.style.setProperty('--sce-static-height',scene.dataset.height+'px');
      viewport.prepend(current.querySelector('.sce-watermark').cloneNode(true));
      doc.querySelectorAll('script').forEach(el=>el.remove());doc.body.appendChild(current.querySelector('script').cloneNode(true));
      return '<!doctype html>'+doc.documentElement.outerHTML;
    },{source,production});
    await writeFile(`qa/watermark/captured-${i}.html`,derived);await page.setViewportSize({width:1360,height:900});await page.goto(url(`captured-${i}`));await ready(page);
    const frozen=()=>page.locator('.sce-card,.sce-group,.sce-edges').evaluateAll(els=>els.map(el=>el.outerHTML));
    const before=await frozen();await preset(page,'#F5F1E8');assert.deepEqual(await frozen(),before);assert.equal(await ink(page),'rgb(0, 0, 0)');
    await page.locator('.sce-background-close').click();await page.screenshot({path:`qa/watermark/captured-${i}.png`});
    summary[file]={cards:await page.locator('.sce-card').count(),groups:await page.locator('.sce-group').count(),edges:await page.locator('[data-edge-id]').count()};
  }
  await page.setViewportSize({width:1360,height:900});await page.goto(url('fixture'));await ready(page);await preset(page,'#1E1E1E');
  await page.emulateMedia({media:'print'});assert.equal(await ink(page),'rgb(0, 0, 0)');
  const printed=await page.locator('.sce-watermark').boundingBox();assert.equal(printed.width,1100);assert.equal(printed.height,1800);assert.equal(printed.y,0);
  await page.screenshot({path:'qa/watermark/print.png',fullPage:true});await page.pdf({path:'qa/watermark/print.pdf',format:'A4',printBackground:true});
  await page.emulateMedia({media:'screen'});assert.equal(await ink(page),'rgb(255, 255, 255)');
  const staticContext=await browser.newContext({javaScriptEnabled:false,offline:true,viewport:{width:650,height:900}}),staticPage=await staticContext.newPage();watch(staticPage);
  await staticPage.goto(url('fixture'));assert.ok(await staticPage.locator('.sce-watermark').isVisible());const staticSize=await staticPage.locator('.sce-watermark').boundingBox();assert.equal(staticSize.width,1100);assert.equal(staticSize.height,1800);
  await staticPage.locator('.sce-viewport').evaluate(el=>el.scrollTop=900);assert.equal(await staticPage.locator('.sce-viewport').evaluate(el=>el.scrollTop),900);await staticPage.screenshot({path:'qa/watermark/no-script.png'});await staticContext.close();summary.printExtentAndNoScript=true;
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile('qa/watermark/results.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}finally{await browser.close();}
