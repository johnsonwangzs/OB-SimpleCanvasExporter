import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

await mkdir('qa/search',{recursive:true});
await build({stdin:{contents:`export {startViewer} from './src/viewer'; export {viewerToolbar} from './src/viewer-html'; export {viewerCSS} from './src/styles'; export {EN,ZH} from './src/i18n';`,resolveDir:process.cwd()},
  outfile:'qa/search/runtime.mjs',bundle:true,format:'esm',target:'es2022',minifySyntax:true,
  plugins:[{name:'language-only',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const getLanguage = () => "en";'}));}}]});
const {startViewer,viewerToolbar,viewerCSS,EN,ZH}=await import(pathToFileURL(resolve('qa/search/runtime.mjs')).href);
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
const fixtures=[
  {id:'long',x:500,y:40,html:`${'<p>Long card context.</p>'.repeat(65)}<p>bottom needle</p>`},
  {id:'front',x:40,y:40,html:'<p>needle alpha <strong>beta</strong> needle</p><span class="badge">logits-based</span><p><a href="https://example.invalid/hidden-target">显示别名</a></p>'},
  {id:'blocks',x:40,y:310,html:'<p>alpha</p><p>beta</p><span style="display:none">hiddenneedle</span><span style="visibility:hidden">invisibleneedle</span><span class="sce-resource-placeholder">excludedneedle</span>'},
  {id:'details',x:500,y:310,html:'<details><summary>展开内容</summary><p>foldedneedle</p></details>'},
  {id:'unicode',x:40,y:580,html:'<p>İ <b>X</b> 中文搜索 foo   bar [x]+.* emoji 🐈</p>'},
  {id:'wide',x:500,y:580,html:`<pre style="overflow-x:auto;white-space:pre"><code>${'x'.repeat(180)} horizontalneedle</code></pre>`},
  {id:'file',type:'file',x:40,y:850,html:'<p>needle excluded-file</p>'},
];
const links=[['both','front','long'],['one','front','blocks'],['none','blocks','details']];
const nodeHTML=(cards)=>cards.map((c,i)=>`<article class="sce-card" data-node-id="${c.id}" data-node-type="${c.type??'text'}" style="left:${c.x}px;top:${c.y}px;width:400px;height:190px;z-index:${i+2};border:1px solid #888;border-radius:8px;background:var(--sce-bg)"><div class="sce-card-scroll" tabindex="0" style="padding:14px">${c.html}</div></article>`).join('');
const edgeHTML=links.map(([id,a,b])=>`<g data-edge-id="${id}" data-from-node="${a}" data-to-node="${b}" style="opacity:.8"><path d="M40 100L800 600" stroke="#999" fill="none"/></g>`).join('');
const labelHTML=links.map(([id,a,b],i)=>`<div class="sce-edge-label" data-edge-label="${id}" data-from-node="${a}" data-to-node="${b}" style="left:450px;top:${260+i*270}px">${id}</div>`).join('');
function documentHTML(cards=fixtures,lang=ZH,dark=false,dimensions={width:960,height:1100}){
  return `<!doctype html><html lang="${lang===ZH?'zh-CN':'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"><style>${viewerCSS}
  body{--sce-bg:${dark?'#202024':'#ffffff'};--sce-text:${dark?'#eeeef3':'#25252b'};--sce-border:${dark?'#474752':'#d7d7e0'};--sce-hover:${dark?'#29292f':'#f6f6fa'};--sce-accent:${dark?'#b49bec':'#7052bf'};--sce-search-hit-bg:${dark?'#715416':'#ffe68a'};--sce-search-hit-text:${dark?'#fff0b8':'#32270b'};color-scheme:${dark?'dark':'light'}}p{margin:8px 0}.badge{background:#e7f4ed;color:#246345;font:12px system-ui;border-radius:4px;padding:1px 5px}
  </style></head><body>${viewerToolbar(lang,'Search regression',cards.length,links.length)}<main class="sce-viewport" tabindex="0"><div class="sce-scene" data-width="${dimensions.width}" data-height="${dimensions.height}" style="width:${dimensions.width}px;height:${dimensions.height}px"><svg class="sce-edges" width="960" height="1100" aria-hidden="true">${edgeHTML}</svg>${nodeHTML(cards)}${labelHTML}</div></main><script>(${startViewer.toString()})(${JSON.stringify(lang.searchCurrent)});</script></body></html>`;
}
await writeFile('qa/search/fixture.html',documentHTML());
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const errors=[],requests=[],summary={};
const watch=page=>{page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});};
const open=async(page,file='qa/search/fixture.html')=>{await page.goto(pathToFileURL(resolve(file)).href);await page.locator('.sce-interactive').waitFor();};
const state=page=>page.evaluate(()=>({zoom:document.querySelector('.sce-scene').dataset.zoom,x:document.querySelector('.sce-scene').dataset.panX,y:document.querySelector('.sce-scene').dataset.panY,scrolls:Array.from(document.querySelectorAll('.sce-card-scroll')).map(e=>[e.scrollTop,e.scrollLeft])}));
async function searchFor(page,value,cards,hits){
  await page.locator('input[type=search]').fill(value);
  await page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('.sce-search-match').count(),cards,`Card count for ${value}`);
  if(hits!==undefined)assert.equal(await page.evaluate(()=>CSS.highlights.get('sce-search')?.size??0),hits,`Occurrence count for ${value}`);
}
try {
  const context=await browser.newContext({viewport:{width:1360,height:900},offline:true});
  const page=await context.newPage();watch(page);await open(page);
  const before=await state(page);
  const layout=()=>page.evaluate(()=>Array.from(document.querySelectorAll('.sce-card')).map(e=>({id:e.dataset.nodeId,w:e.offsetWidth,h:e.offsetHeight,left:e.style.left,top:e.style.top,scroll:e.firstElementChild.scrollHeight,html:e.firstElementChild.innerHTML})));
  const original=await layout();
  await searchFor(page,'needle',3,4);
  assert.deepEqual(await state(page),before,'Typing must not move viewport or scroll cards');
  assert.deepEqual(await layout(),original,'Search must not alter content or layout');
  const edgeOpacity=await page.evaluate(()=>Object.fromEntries(Array.from(document.querySelectorAll('[data-edge-id]')).map(e=>[e.dataset.edgeId,Number(getComputedStyle(e).opacity)])));
  assert.deepEqual(edgeOpacity,{both:.8,one:.48,none:.16});
  assert.equal(await page.locator('[data-edge-label=one]').evaluate(e=>getComputedStyle(e).opacity),'0.6');
  await page.screenshot({path:'qa/search/results-light.png'});
  await page.locator('input[type=search]').press('Enter');
  assert.equal(await page.locator('[aria-current=true]').getAttribute('data-node-id'),'front','Navigation follows geometry, not source order');
  await page.locator('input[type=search]').press('Enter');
  assert.equal(await page.locator('[aria-current=true]').getAttribute('data-node-id'),'long');
  assert.ok(await page.locator('[data-node-id=long] .sce-card-scroll').evaluate(e=>e.scrollTop>100));
  assert.ok(await page.locator('[data-node-id=long] p:last-child').evaluate(e=>{const r=e.getBoundingClientRect(),p=e.closest('.sce-card-scroll').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom;}),'Bottom hit revealed inside card');
  assert.equal(await page.locator('input[type=search]').evaluate(e=>document.activeElement===e),true);
  await page.locator('[data-search-action=next]').click();
  assert.equal(await page.locator('[aria-current=true]').getAttribute('data-node-id'),'wide');
  assert.ok(await page.locator('[data-node-id=wide] pre').evaluate(e=>e.scrollLeft>100),'Nested code scroll follows hit');
  await page.locator('[data-search-action=next]').click();
  assert.equal(await page.locator('[aria-current=true]').getAttribute('data-node-id'),'front');
  await page.locator('.sce-search-dim-toggle').uncheck();
  assert.equal(await page.locator('.sce-search-dim,.sce-search-edge-faint,.sce-search-edge-related').count(),0);
  await page.locator('.sce-search-dim-toggle').check();
  await page.locator('[data-search-action=all]').click();
  assert.ok(await page.locator('.sce-search-match').evaluateAll(cards=>cards.every(e=>{const r=e.getBoundingClientRect(),p=document.querySelector('.sce-viewport').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom;})));
  const settled=await state(page);
  await page.locator('input[type=search]').press('Escape');
  assert.equal(await page.locator('.sce-search-match,.sce-search-ring,.sce-search-dim').count(),0);
  assert.deepEqual(await state(page),settled,'Clear preserves reading position');
  await searchFor(page,'ALPHA BETA',2,2);
  await searchFor(page,'alphabeta',0,0);
  for(const [q,n] of [['logits',1],['显示别名',1],['hidden-target',0],['hiddenneedle',0],['invisibleneedle',0],['excludedneedle',0],['excluded-file',0],['foldedneedle',0],['中文搜索',1],['foo bar',1],['[x]+.*',1],['🐈',1],['İ X',1]])await searchFor(page,q,n,n);
  const foldedRange=await page.evaluate(()=>{const h=CSS.highlights.get('sce-search');return Array.from(h)[0].toString();});
  assert.equal(foldedRange,'İ X','Case expansion offsets point to original text');
  await page.locator('input[type=search]').fill('');
  await page.locator('[data-node-id=details] details').evaluate(e=>{e.open=true;});
  await searchFor(page,'foldedneedle',1,1);
  await page.locator('[data-node-id=details] details').evaluate(e=>{e.open=false;});
  await page.waitForFunction(()=>document.querySelectorAll('.sce-search-match').length===0);
  await searchFor(page,'needle',3,4);
  const imeState=await state(page);
  await page.locator('input[type=search]').evaluate(e=>{e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.value='中文';e.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));});
  assert.deepEqual(await state(page),imeState,'IME confirmation does not navigate');
  assert.equal(await page.locator('.sce-search-match').count(),3,'No partial composition search');
  await page.locator('input[type=search]').evaluate(e=>e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
  await page.waitForFunction(()=>document.querySelector('.sce-search-status').textContent.includes('命中 1 张'));
  await page.locator('input[type=search]').fill('needle');
  await page.locator('input[type=search]').fill('no-results');
  await page.waitForFunction(()=>document.querySelector('.sce-search-status').textContent.includes('未找到'));
  assert.equal(await page.locator('.sce-search-dim').count(),0);
  await searchFor(page,'needle',3,4);
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('.sce-search-ring').first().evaluate(e=>getComputedStyle(e).display),'none');
  assert.equal(await page.locator('[data-edge-id=none]').evaluate(e=>getComputedStyle(e).opacity),'0.8');
  assert.equal(await page.locator('[data-node-id=blocks]').evaluate(e=>getComputedStyle(e).opacity),'1');
  await page.emulateMedia({media:'screen'});
  await page.locator('input[type=search]').press('Escape');
  await page.locator('[data-action=reset]').click();
  const dragStart=await page.locator('.sce-viewport').evaluate(e=>({x:20,y:e.getBoundingClientRect().top+15}));
  assert.equal(await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('.sce-card'),dragStart),false);
  const panBefore=await state(page);
  await page.mouse.move(dragStart.x,dragStart.y);await page.mouse.down();await page.mouse.move(dragStart.x+60,dragStart.y+30);await page.mouse.up();
  const panAfter=await state(page);assert.equal(Number(panAfter.x)-Number(panBefore.x),60);assert.equal(Number(panAfter.y)-Number(panBefore.y),30);
  await page.keyboard.down('Control');await page.mouse.wheel(0,-150);await page.keyboard.up('Control');
  await page.waitForFunction(scale=>Number(document.querySelector('.sce-scene').dataset.zoom)>Number(scale),panAfter.zoom);
  await page.locator('[data-node-id=front] p').first().evaluate(e=>{const range=document.createRange();range.selectNodeContents(e);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
  const selected=await page.evaluate(()=>getSelection().toString());
  await page.locator('input[type=search]').evaluate(e=>{e.value='needle';e.dispatchEvent(new InputEvent('input',{bubbles:true}));});
  await page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>getSelection().toString()),selected,'Highlighting preserves text selection');
  summary.interactions=true;

  for(const dark of [false,true])for(const width of [1360,650,320]){
    await writeFile('qa/search/responsive.html',documentHTML(fixtures,dark?EN:ZH,dark));
    await page.setViewportSize({width,height:900});await open(page,'qa/search/responsive.html');await searchFor(page,'needle',3,4);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Toolbar fits narrow screens');
    assert.ok(await page.evaluate(()=>Math.abs(document.querySelector('.sce-toolbar').getBoundingClientRect().bottom-document.querySelector('.sce-viewport').getBoundingClientRect().top)<1),'Viewport follows toolbar height');
    await page.screenshot({path:`qa/search/${dark?'dark':'light'}-${width}.png`});
  }
  summary.responsiveAndThemes=true;
  const fallback=await browser.newContext({offline:true});await fallback.addInitScript(()=>{Object.defineProperty(window,'Highlight',{value:undefined});});
  const fallbackPage=await fallback.newPage();watch(fallbackPage);await open(fallbackPage);await searchFor(fallbackPage,'needle',3);
  assert.ok(await fallbackPage.locator('.sce-search-fallback').isVisible());
  await fallbackPage.locator('input[type=search]').press('Enter');assert.equal(await fallbackPage.locator('[aria-current=true]').getAttribute('data-node-id'),'front');
  await fallback.close();summary.noHighlightFallback=true;
  const staticContext=await browser.newContext({javaScriptEnabled:false,offline:true});const staticPage=await staticContext.newPage();watch(staticPage);
  await staticPage.goto(pathToFileURL(resolve('qa/search/fixture.html')).href);
  assert.equal(await staticPage.locator('.sce-card').count(),fixtures.length);assert.ok(await staticPage.locator('.sce-search').isHidden());
  assert.equal(await staticPage.locator('.sce-viewport').evaluate(e=>getComputedStyle(e).overflow),'auto');
  await staticContext.close();summary.staticFallback=true;

  // Reuse the captured Obsidian/Prism body and theme without requiring a running app.
  for(const file of ['qa/example-canvas.html','qa/prism-after/example-canvas.html']){
    let old;try{old=await readFile(file,'utf8');}catch{continue;}
    await page.setViewportSize({width:1600,height:1000});
    const upgraded=old.replace(/<header class="sce-toolbar">[\s\S]*?<\/header>/,viewerToolbar(ZH,'Captured Canvas',25,24))
      .replace(/<style>[\s\S]*?(?=\.sce-s0\{)/,()=>`<style>${viewerCSS}\n`)
      .replace(/<script>[\s\S]*?<\/script>/,`<script>(${startViewer.toString()})(${JSON.stringify(ZH.searchCurrent)});</script>`);
    await writeFile('qa/search/captured.html',upgraded);await open(page,'qa/search/captured.html');
    const nativeLayout=await layout();await page.locator('input[type=search]').fill('logits');await page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');
    assert.ok(await page.locator('.sce-search-match').count()>1);assert.deepEqual(await layout(),nativeLayout);
    await page.screenshot({path:`qa/search/captured-${file.includes('prism')?'prism':'default'}.png`});
    summary[file]=true;
  }
  if(process.argv[2]){
    await open(page,process.argv[2]);
    assert.equal(await page.locator('meta[name=generator]').getAttribute('content'),`Simple Canvas Exporter ${manifest.version}`);
    const geometry=await layout(),position=await state(page);
    await page.locator('input[type=search]').fill('logits');await page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');
    assert.equal(await page.locator('.sce-search-match').count(),6);assert.equal(await page.evaluate(()=>CSS.highlights.get('sce-search').size),8);
    assert.deepEqual(await layout(),geometry);assert.deepEqual(await state(page),position);
    assert.ok(await page.locator('.sce-edges path').evaluateAll(paths=>paths.every(p=>getComputedStyle(p).stroke!=='none')));
    await page.screenshot({path:'qa/search/production-results.png'});
    await page.locator('input[type=search]').press('Enter');await page.locator('input[type=search]').press('Enter');
    assert.equal(await page.locator('[aria-current=true]').count(),1);
    await page.screenshot({path:'qa/search/production-reading.png'});
    summary.productionExport={cards:await page.locator('.sce-card').count(),nativeEdges:await page.locator('[data-path-source=native]').count(),badges:await page.locator('.badge').count(),matches:6,hits:8};
  }
  const large=Array.from({length:500},(_,i)=>({id:`load-${i}`,x:(i%20)*450+40,y:Math.floor(i/20)*240+40,html:`<p>${'context '.repeat(249)}benchmark</p>`}));
  await writeFile('qa/search/large.html',documentHTML(large,EN,false,{width:9100,height:6100}));
  await open(page,'qa/search/large.html');
  const started=await page.evaluate(()=>{const e=document.querySelector('input[type=search]');e.value='benchmark';const now=performance.now();e.dispatchEvent(new InputEvent('input',{bubbles:true}));return now;});
  await page.waitForFunction(()=>document.querySelector('.sce-search-status').textContent==='500 matching cards · 500 occurrences');
  summary.largeQueryMs=Math.round(await page.evaluate(()=>performance.now())-started);
  assert.equal(await page.locator('.sce-search-match').count(),500);
  // Clear while a common-word query is still in flight; an older result must not reappear.
  await page.locator('input[type=search]').fill('context');
  await page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='true');
  await page.locator('[data-search-action=clear]').click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.sce-search-match').count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await writeFile('qa/search/results.json',JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2));
} finally {await browser.close();}
