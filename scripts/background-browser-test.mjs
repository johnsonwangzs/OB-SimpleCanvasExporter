import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

await mkdir('qa/background',{recursive:true});
const languagePlugin={name:'language-only',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const getLanguage=()=>"en";'}));}};
await build({stdin:{contents:`export {startViewer} from './src/viewer';export {viewerToolbar} from './src/viewer-html';export {viewerCSS} from './src/styles';export {EN,ZH} from './src/i18n';`,resolveDir:process.cwd()},outfile:'qa/background/runtime.mjs',bundle:true,format:'esm',target:'es2022',minifySyntax:true,plugins:[languagePlugin]});
const {startViewer,viewerToolbar,viewerCSS,EN,ZH}=await import(pathToFileURL(resolve('qa/background/runtime.mjs')).href);
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
await build({stdin:{contents:`export {exportCanvas} from './src/export';export {ZH} from './src/i18n';`,resolveDir:process.cwd()},outfile:'qa/background/export.js',bundle:true,format:'iife',globalName:'exportTest',target:'es2022',minifySyntax:true,plugins:[{name:'empty-obsidian',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const getLanguage=()=>"zh";export class Component{load(){}unload(){}}export class TFile{}export class TextFileView{}export const MarkdownRenderer={};export const parseLinktext=path=>({path});'}));}}]});
const script=`(${startViewer.toString()})(${JSON.stringify(ZH.searchCurrent)});`;
function fixture({id='one',dark=false,lang=ZH,empty=false,original}={}){
  const cards=empty?'':`<svg class="sce-edges"><path data-edge-id="ab" data-from-node="a" data-to-node="b" stroke="#888" stroke-width="2" d="M 380 180 L 540 180"/></svg><div class="sce-edge-label" data-from-node="a" data-to-node="b" style="left:440px;top:180px">connection</div>${['a','b'].map((id,i)=>`<article class="sce-card" data-node-id="${id}" data-node-type="text" style="left:${40+i*500}px;top:40px;width:340px;height:280px;background:${i?'rgba(80,160,120,.15)':dark?'#282828':'#ffffff'};border:1px solid #888;border-radius:8px"><div class="sce-card-scroll" tabindex="0"><div class="sce-render-sizer" style="padding:20px"><p>needle ${id}</p><span class="badge badge-green" style="color:#287044;background:#d8efdb">Topic</span>${'<p>Long card content for independent scrolling.</p>'.repeat(45)}</div></div></article>`).join('')}`;
  return `<!doctype html><html lang="${lang===ZH?'zh-CN':'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="Simple Canvas Exporter ${manifest.version}"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';img-src data:"><style>${viewerCSS}body{--sce-bg:${original??(dark?'#202024':'#ffffff')};--sce-text:${dark?'#eee':'#222'};--sce-border:${dark?'#555':'#ccc'};--sce-hover:${dark?'#333':'#f4f4f4'};--sce-accent:${dark?'#b49bec':'#7052bf'};color-scheme:${dark?'dark':'light'}}</style></head><body data-sce-export-id="${id}">${viewerToolbar(lang,'Canvas background regression / 画布背景',empty?0:2,empty?0:1)}<main class="sce-viewport" tabindex="0"><div class="sce-scene" data-width="1000" data-height="800" style="width:1000px;height:800px">${cards||'<div class="sce-empty">Empty Canvas</div>'}</div></main><script>(${startViewer.toString()})(${JSON.stringify(lang.searchCurrent)});</script></body></html>`;
}
const files=['fixture','copy','dark','english','empty','fractional'];
for(const file of files)await writeFile(`qa/background/${file}.html`,fixture({dark:file==='dark',lang:file==='english'?EN:ZH,empty:file==='empty',original:file==='fractional'?'color(display-p3 0.2 0.25 0.3)':undefined}));
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const errors=[],requests=[],summary={};
const watch=page=>{page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});};
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const open=async(page,file='fixture')=>{await page.goto(pathToFileURL(resolve(`qa/background/${file}.html`)).href);await page.locator('.sce-interactive').waitFor();await settle(page);};
const popup=page=>page.locator('.sce-background-popup');
const show=async page=>{if(await popup(page).isHidden())await page.locator('.sce-background-trigger').click();};
const preset=async(page,color)=>{await show(page);await page.locator(`.sce-background-preset[data-color="${color}"]`).click();};
const bg=page=>page.locator('.sce-viewport').evaluate(el=>getComputedStyle(el).backgroundColor);
const stored=page=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('sce:bg:v1:')).map(k=>[k,localStorage.getItem(k)])));
const ready=page=>page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');
const snapshot=page=>page.evaluate(()=>({
  transform:document.querySelector('.sce-scene').style.transform,
  query:document.querySelector('.sce-search-input input').value,status:document.querySelector('.sce-search-status').textContent,
  selected:Array.from(document.querySelectorAll('.sce-badge-chip[aria-pressed=true]'),e=>e.getAttribute('aria-label')),
  cards:Array.from(document.querySelectorAll('.sce-card'),el=>{const scroll=el.querySelector('.sce-card-scroll'),style=getComputedStyle(el);return {html:el.innerHTML,geometry:el.getAttribute('style'),scroll:scroll.scrollTop,bg:style.backgroundColor,color:style.color};}),
  edges:Array.from(document.querySelectorAll('.sce-edges path'),e=>({d:e.getAttribute('d'),stroke:getComputedStyle(e).stroke})),
  reader:{html:document.querySelector('.sce-reader-body').innerHTML,scroll:document.querySelector('.sce-reader-body').scrollTop,font:document.querySelector('.sce-reader-font').textContent,source:document.querySelector('.sce-reader').dataset.source},
  surfaces:Array.from(document.querySelectorAll('.sce-toolbar,.sce-reader,.sce-edge-label'),e=>getComputedStyle(e).backgroundColor)
}));
try{
  const context=await browser.newContext({viewport:{width:1360,height:900},offline:true}),page=await context.newPage();watch(page);
  // Exercise the actual export assembler and its serialized runtime without mocking its HTML.
  await open(page,'empty');await page.addScriptTag({path:resolve('qa/background/export.js')});
  const exported=await page.evaluate(async()=>{
    window.createDiv=({cls}={})=>{const el=document.createElement('div');if(cls)el.className=cls;return el;};
    const snap={document,data:{nodes:[],edges:[],warnings:[]},file:{basename:'Empty export <&>',path:'empty.canvas'}};
    const a=await exportTest.exportCanvas({},snap,exportTest.ZH,new AbortController().signal),b=await exportTest.exportCanvas({},snap,exportTest.ZH,new AbortController().signal);
    return {a:a.html,b:b.html,stages:document.querySelectorAll('.sce-staging').length};
  });
  const exportId=html=>html.match(/data-sce-export-id="([^"]+)"/)[1];
  assert.match(exportId(exported.a),/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/);assert.notEqual(exportId(exported.a),exportId(exported.b));assert.equal(exported.stages,0);
  assert.ok(exported.a.includes(`Simple Canvas Exporter ${manifest.version}`));
  await writeFile('qa/background/empty-production.html',exported.a);await open(page,'empty-production');
  assert.equal(await page.title(),'Empty export <&>');await preset(page,'#F5F1E8');await page.reload();await page.locator('.sce-interactive').waitFor();assert.equal(await bg(page),'rgb(245, 241, 232)');summary.productionAssemblerAndUniqueIds=true;
  await show(page);await page.locator('.sce-background-reset').click();
  await open(page);assert.equal(await bg(page),'rgb(255, 255, 255)');assert.ok(await popup(page).isHidden());
  await page.locator('.sce-search-input input').fill('needle');await ready(page);
  await page.locator('.sce-badge-chips button').click();await ready(page);
  await page.locator('[data-reader-node=a] button').evaluate(el=>el.focus({preventScroll:true}));await page.keyboard.press('Enter');await settle(page);
  await page.locator('.sce-card-scroll').first().evaluate(el=>el.scrollTop=150);await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop=240);
  await page.locator('[data-reader-font="2"]').click();await page.locator('[data-action=in]').click();await settle(page);
  const before=await snapshot(page);
  await preset(page,'#F5F1E8');assert.equal(await bg(page),'rgb(245, 241, 232)');assert.deepEqual(await snapshot(page),before);
  assert.equal(await page.locator('.sce-background-status').textContent(),ZH.backgroundSaved);
  assert.equal(Object.values(await stored(page))[0],'#F5F1E8');
  await page.locator('.sce-background-hex').press('Escape');assert.ok(await popup(page).isHidden());assert.ok(await page.locator('.sce-reader').isVisible());assert.equal(await page.locator('.sce-search-input input').inputValue(),'needle');
  await page.locator('.sce-background-trigger').press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.dataset.color),'#F5F1E8');
  await page.locator('.sce-badge-more').evaluate(el=>el.click());assert.ok(await popup(page).isHidden());assert.ok(await page.locator('.sce-badge-popup').isVisible());
  await page.locator('.sce-background-trigger').evaluate(el=>el.click());assert.ok(await popup(page).isVisible());assert.ok(await page.locator('.sce-badge-popup').isHidden());
  assert.deepEqual(await snapshot(page),before);summary.searchBadgesReaderAndGeometry=true;

  const hex=page.locator('.sce-background-hex');
  for(const [raw,expected] of [[' abc ','#AABBCC'],['#123','#112233'],[' 123aBc ','#123ABC']]){await hex.fill(raw);await hex.press('Enter');assert.equal(await hex.inputValue(),expected);assert.equal(Object.values(await stored(page))[0],expected);}
  const valid=await bg(page),validStored=await stored(page);
  for(const raw of ['#12','red','#11223344','transparent','url(https://example.invalid/x)','<style>']){await hex.fill(raw);await hex.press('Enter');assert.equal(await hex.getAttribute('aria-invalid'),'true');assert.equal(await bg(page),valid);assert.deepEqual(await stored(page),validStored);}
  await hex.press('Escape');await show(page);assert.equal(await hex.inputValue(),'#123ABC');assert.equal(await hex.getAttribute('aria-invalid'),'false');
  await hex.fill('def');await page.locator('.sce-background-close').click();await show(page);assert.equal(await hex.inputValue(),'#DDEEFF');
  // Native picker input previews, change or popup close commits. No writes per drag step.
  const savedBeforePicker=await stored(page);
  await page.locator('.sce-background-picker').evaluate(el=>{el.value='#345678';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await bg(page),'rgb(52, 86, 120)');assert.deepEqual(await stored(page),savedBeforePicker);
  await page.locator('.sce-background-close').click();assert.equal(Object.values(await stored(page))[0],'#345678');
  await show(page);await page.locator('.sce-background-picker').evaluate(el=>{el.value='#ab1234';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await hex.inputValue(),'#AB1234');assert.equal(Object.values(await stored(page))[0],'#AB1234');
  await preset(page,'#FFFFFF');assert.ok(await page.locator('.sce-background-reset').isEnabled());
  await page.locator('.sce-background-reset').click();assert.deepEqual(await stored(page),{});assert.equal(await bg(page),'rgb(255, 255, 255)');
  assert.ok(await page.locator('.sce-background-picker').evaluate(el=>el===document.activeElement));
  summary.colorsValidationPickerAndRestore=true;

  await preset(page,'#202631');await page.reload();await page.locator('.sce-interactive').waitFor();assert.equal(await bg(page),'rgb(32, 38, 49)');
  await page.goto(pathToFileURL(resolve('qa/background/fixture.html')).href+'?reading=1#section');await page.locator('.sce-interactive').waitFor();assert.equal(await bg(page),'rgb(32, 38, 49)');
  await open(page,'copy');assert.equal(await bg(page),'rgb(255, 255, 255)');
  await writeFile('qa/background/fixture.html',fixture({id:'new-export'}));await open(page);assert.equal(await bg(page),'rgb(255, 255, 255)');
  await preset(page,'#282828');let entries=await stored(page),key=Object.keys(entries).find(k=>k.includes(':new-export:'));
  await page.evaluate(key=>localStorage.setItem(key,'url(https://example.invalid/bad)'),key);await page.reload();await page.locator('.sce-interactive').waitFor();assert.equal(await bg(page),'rgb(255, 255, 255)');
  await preset(page,'#F5F5F5');await show(page);await page.locator('.sce-background-reset').click();await page.reload();await page.locator('.sce-interactive').waitFor();assert.equal(await bg(page),'rgb(255, 255, 255)');
  summary.persistenceIdentityAndCorruptRecords=true;
  // A hosted origin shares storage across paths; the explicit document address still isolates it.
  const hosted=await browser.newContext(),hp=await hosted.newPage();hp.on('pageerror',e=>errors.push(String(e)));
  await hp.route('**/*',route=>route.fulfill({contentType:'text/html',body:fixture()}));
  await hp.goto('https://canvas.invalid/a.html');await hp.locator('.sce-interactive').waitFor();await preset(hp,'#202631');
  await hp.goto('https://canvas.invalid/b.html');await hp.locator('.sce-interactive').waitFor();assert.equal(await bg(hp),'rgb(255, 255, 255)');
  await hp.goto('https://canvas.invalid/a.html?view=1#card');await hp.locator('.sce-interactive').waitFor();assert.equal(await bg(hp),'rgb(32, 38, 49)');await hosted.close();summary.sharedOriginFileIsolation=true;

  for(const operation of ['getter','getItem','setItem','removeItem']){
    const isolated=await browser.newContext({offline:true}),p=await isolated.newPage();watch(p);await open(p,'copy');
    await preset(p,'#F5F1E8');
    await p.addInitScript(operation=>{
      if(operation==='getter')Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Denied','SecurityError');}});
      else Storage.prototype[operation]=()=>{throw new DOMException('Denied','QuotaExceededError');};
    },operation);
    await p.reload();await p.locator('.sce-interactive').waitFor();
    await preset(p,'#202631');assert.equal(await bg(p),'rgb(32, 38, 49)');
    if(operation==='getter'||operation==='setItem')assert.equal(await p.locator('.sce-background-status').textContent(),ZH.backgroundSession);
    if(operation==='removeItem'){
      await p.locator('.sce-background-reset').click();assert.equal(await bg(p),'rgb(255, 255, 255)');assert.equal(await p.locator('.sce-background-status').textContent(),ZH.backgroundResetFailed);assert.ok(await p.locator('.sce-background-reset').isEnabled());
      await p.reload();await p.locator('.sce-interactive').waitFor();assert.equal(await bg(p),'rgb(32, 38, 49)');
    }
    await p.locator('.sce-search-input input').fill('needle');await ready(p);assert.equal(await p.locator('.sce-search-match').count(),2);await isolated.close();
  }
  summary.storageFailuresAreIsolated=true;

  for(const file of ['fixture','dark','english','empty','fractional']){
    await open(page,file);const original=await bg(page);
    for(const width of [1360,650,320]){
      await page.setViewportSize({width,height:900});await settle(page);await preset(page,'#F5F1E8');
      const bounds=await popup(page).boundingBox();assert.ok(bounds.x>=7&&bounds.x+bounds.width<=width-7);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`qa/background/${file}-${width}.png`});
      await page.emulateMedia({media:'print'});assert.ok(await popup(page).isHidden());assert.ok(await page.locator('.sce-background-trigger').isHidden());assert.equal(await bg(page),original);
      await page.emulateMedia({media:'screen'});assert.equal(await bg(page),'rgb(245, 241, 232)');
      await page.locator('.sce-background-reset').click();assert.equal(await bg(page),original);
      await page.locator('.sce-background-close').click();
    }
  }
  await page.setViewportSize({width:1360,height:220});await show(page);let box=await popup(page).boundingBox();assert.ok(box.y>=8&&box.y+box.height<=213);assert.ok(await popup(page).evaluate(el=>el.scrollHeight>el.clientHeight));
  await page.setViewportSize({width:1360,height:900});await open(page);await show(page);
  const viewBefore=await page.locator('.sce-scene').getAttribute('style');
  await page.mouse.move(15,850);await page.mouse.down();await page.mouse.move(115,820);await page.mouse.up();assert.ok(await popup(page).isHidden());assert.equal(await page.locator('.sce-scene').getAttribute('style'),viewBefore);
  await page.mouse.move(15,850);await page.mouse.down();await page.mouse.move(115,820);await page.mouse.up();assert.notEqual(await page.locator('.sce-scene').getAttribute('style'),viewBefore);
  await show(page);await page.locator('.sce-search-input input').focus();assert.ok(await popup(page).isHidden());assert.ok(await page.locator('.sce-search-input input').evaluate(el=>el===document.activeElement));
  summary.responsivePrintColorSpaceAndFocus=true;

  const touch=await browser.newContext({viewport:{width:320,height:740},hasTouch:true,isMobile:true,offline:true}),tp=await touch.newPage();watch(tp);await open(tp);await tp.locator('.sce-background-trigger').tap();
  for(const selector of ['.sce-background-trigger','.sce-background-close','.sce-background-picker','.sce-background-hex','.sce-background-preset'])assert.ok(await tp.locator(selector).first().evaluate(el=>el.getBoundingClientRect().height>=44));
  await tp.locator('.sce-background-preset[data-color="#F5F1E8"]').tap();assert.equal(await bg(tp),'rgb(245, 241, 232)');await tp.screenshot({path:'qa/background/touch.png'});await touch.close();
  const staticContext=await browser.newContext({javaScriptEnabled:false,offline:true}),sp=await staticContext.newPage();await sp.goto(pathToFileURL(resolve('qa/background/fixture.html')).href);assert.ok(await sp.locator('.sce-background-trigger').isHidden());assert.ok(await popup(sp).isHidden());assert.equal(await sp.locator('.sce-card').count(),2);assert.equal(await sp.locator('.sce-viewport').evaluate(el=>getComputedStyle(el).overflow),'auto');await staticContext.close();summary.touchAndNoScript=true;

  // Reuse genuine frozen card/edge styles with the current viewer. These are derived fixtures,
  // not claims of a fresh live Obsidian export. Missing captures may be supplied as CLI paths.
  const captures=process.argv.slice(2);
  if(!captures.length)for(const path of ['qa/default-after/production-export.html','qa/prism-after/production-export.html']){try{await readFile(path);captures.push(path);}catch{}}
  for(const [i,file] of captures.entries()){
    const source=await readFile(file,'utf8');
    const html=await page.evaluate(({source,css,toolbar,script,version,i})=>{
      const doc=new DOMParser().parseFromString(source,'text/html');
      doc.querySelectorAll('script,.sce-toolbar,.sce-background-popup,.sce-badge-popup,.sce-reader').forEach(el=>el.remove());
      // Preserve the frozen StyleBank, but replace legacy viewer CSS in full; otherwise old
      // toolbar display/height rules survive properties absent from the current stylesheet.
      const banks=Array.from(doc.querySelectorAll('style'),el=>{const text=el.textContent,index=text.search(/\.sce-s\d+\{/);el.remove();return index<0?'':text.slice(index);});
      const style=doc.createElement('style');style.textContent=css+'\n'+banks.join('\n');doc.head.appendChild(style);
      doc.body.insertAdjacentHTML('afterbegin',toolbar);doc.body.dataset.sceExportId=`capture-${i}`;
      doc.querySelector('meta[name=generator]').content=`Simple Canvas Exporter ${version}`;
      const runtime=doc.createElement('script');runtime.textContent=script;doc.body.appendChild(runtime);
      return '<!doctype html>'+doc.documentElement.outerHTML;
    },{source,css:viewerCSS,toolbar:viewerToolbar(ZH,'Captured theme regression',25,24),script,version:manifest.version,i});
    await writeFile(`qa/background/captured-${i}.html`,html);await page.setViewportSize({width:1360,height:900});await open(page,`captured-${i}`);
    assert.ok(await page.locator('.sce-toolbar').evaluate(el=>el.getBoundingClientRect().bottom>=el.querySelector('.sce-badge-filter').getBoundingClientRect().bottom));
    await page.locator('.sce-search-input input').fill('logits');await ready(page);assert.equal(await page.locator('.sce-search-match').count(),6);
    const captureBefore=await snapshot(page);await preset(page,'#F5F1E8');assert.deepEqual(await snapshot(page),captureBefore);
    await page.screenshot({path:`qa/background/captured-${i}.png`});
    summary[file]={cards:await page.locator('.sce-card').count(),edges:await page.locator('[data-edge-id]').count(),matchingCards:6};
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await writeFile('qa/background/results.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}finally{await browser.close();}
