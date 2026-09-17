import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

await mkdir('qa/reader',{recursive:true});
await build({stdin:{contents:`export {startViewer} from './src/viewer'; export {viewerToolbar} from './src/viewer-html'; export {viewerCSS} from './src/styles'; export {EN,ZH} from './src/i18n';`,resolveDir:process.cwd()},
  outfile:'qa/reader/runtime.mjs',bundle:true,format:'esm',target:'es2022',minifySyntax:true,
  plugins:[{name:'language-only',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const getLanguage=()=>"en";'}));}}]});
const {startViewer,viewerToolbar,viewerCSS,EN,ZH}=await import(pathToFileURL(resolve('qa/reader/runtime.mjs')).href);
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
const fixtures=[
  {id:'rich',x:40,y:40,html:`<h2 id="section">完整正文</h2><p>needle alpha <strong>beta</strong> needle</p><span class="badge">logits-based</span><p><a href="https://example.invalid/">外部链接</a> <a href="#section" aria-describedby="section">段落</a></p><pre><code>${'x'.repeat(160)} horizontal</code></pre><table><tr>${'<td>wide column content</td>'.repeat(12)}</tr></table><p>${'中文长链接'.repeat(30)}</p><svg width="60" height="24" viewBox="0 0 60 24"><defs><linearGradient id="grad"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="60" height="24" fill="url(#grad)"/></svg>`},
  {id:'long',x:540,y:40,html:`<h2>长卡片</h2>${Array.from({length:50},(_,i)=>`<p>第 ${i+1} 段：独立阅读内容，保留原始画布和卡片滚动位置。</p>`).join('')}<p>bottom needle</p>`},
  {id:'details',x:40,y:350,html:'<details><summary>展开内容</summary><p>foldedneedle</p></details><p>İ <b>X</b> 中文搜索 foo   bar [x]+.* emoji 🐈</p>'},
  {id:'empty',x:540,y:350,html:'  '},
  {id:'file',type:'file',x:40,y:660,html:'<p>needle excluded-file</p>'},
  {id:'fallback',x:540,y:660,html:'Fallback text',fallback:true},
];
function documentHTML(lang=ZH,dark=false){
  const nodes=fixtures.map((c,i)=>`<article class="sce-card" data-node-id="${c.id}" data-node-type="${c.type??'text'}" style="left:${c.x}px;top:${c.y}px;width:430px;height:230px;z-index:${i+2};border:1px solid var(--sce-border);border-radius:8px"><div class="sce-card-scroll ${c.fallback?'sce-placeholder':''}" tabindex="0" aria-label="${c.id}">${c.fallback?c.html:`<div aria-hidden="true" style="height:80px"></div><div class="sce-render-sizer frozen-root">${c.html}</div><div aria-hidden="true" style="height:80px"></div>`}</div></article>`).join('');
  return `<!doctype html><html lang="${lang===ZH?'zh-CN':'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="Simple Canvas Exporter ${manifest.version}"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';img-src data:"><style>${viewerCSS}
  body{--sce-bg:${dark?'#202024':'#fff'};--sce-text:${dark?'#eeedf4':'#25252b'};--sce-border:${dark?'#474752':'#d7d7e0'};--sce-hover:${dark?'#29292f':'#f6f6fa'};--sce-accent:${dark?'#b49bec':'#7052bf'};color-scheme:${dark?'dark':'light'}}
  .frozen-root{font:20px/1.5 system-ui;padding:20px;min-height:min-content;flex:1 0 0px}.frozen-root p{font-size:20px;line-height:30px;margin:14px 0}.frozen-root h2{font-size:30px;line-height:36px}.frozen-root strong{font-size:20px}.badge{display:inline-block;background:#dff4df;color:#174a26;font:12px/18px system-ui;border-radius:4px;padding:2px 6px}pre,code{font:18px/27px monospace;white-space:pre}pre{overflow:auto}td{white-space:nowrap;padding:8px}
  </style></head><body>${viewerToolbar(lang,'Reader regression',fixtures.length,0)}<main class="sce-viewport" tabindex="0"><div class="sce-scene" data-width="1020" data-height="940" style="width:1020px;height:940px">${nodes}</div></main><script>(${startViewer.toString()})(${JSON.stringify(lang.searchCurrent)});</script></body></html>`;
}
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const errors=[],requests=[],summary={};
const watch=page=>{page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});};
const open=async(page,file='qa/reader/fixture.html')=>{await page.goto(pathToFileURL(resolve(file)).href);await page.locator('.sce-interactive').waitFor();};
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const cardContent=page=>page.locator('.sce-card-scroll').evaluateAll(els=>els.map(el=>({html:el.innerHTML,scrollTop:el.scrollTop,scrollLeft:el.scrollLeft,width:el.clientWidth,height:el.clientHeight,scrollHeight:el.scrollHeight})));
const view=page=>page.evaluate(()=>{const scene=document.querySelector('.sce-scene'),vp=document.querySelector('.sce-viewport'),scale=Number(scene.dataset.zoom);return {scale,cx:(vp.clientWidth/2-Number(scene.dataset.panX))/scale,cy:(vp.clientHeight/2-Number(scene.dataset.panY))/scale};});
const assertView=(a,b)=>{assert.equal(a.scale,b.scale);assert.ok(Math.abs(a.cx-b.cx)<.01,`${a.cx} / ${b.cx}`);assert.ok(Math.abs(a.cy-b.cy)<.01,`${a.cy} / ${b.cy}`);};
const readCard=async(page,id)=>{const button=page.locator(`[data-reader-node="${id}"] button`);await button.evaluate(el=>el.focus({preventScroll:true}));await button.press('Enter');await settle(page);assert.equal(await page.locator('.sce-reader').getAttribute('data-source'),id);};
async function searchFor(page,value){await page.locator('.sce-search-input input[type=search]').fill(value);await page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');}
const selected=page=>page.locator('.sce-reader').getAttribute('data-source');
try{
  await writeFile('qa/reader/fixture.html',documentHTML());
  const context=await browser.newContext({viewport:{width:1360,height:900},offline:true});
  const page=await context.newPage();watch(page);await open(page);await settle(page);
  assert.equal(await page.locator('.sce-reader-trigger').count(),4,'Only nonempty text cards get a reader');
  assert.ok(await page.locator('.sce-reader').isHidden());
  const original=await cardContent(page),initialView=await view(page);
  await page.locator('[data-node-id=rich]').hover();await page.locator('[data-reader-node=rich] button').click();await settle(page);
  assertView(await view(page),initialView);assert.deepEqual(await cardContent(page),original);
  assert.equal(await page.locator('.sce-reader-body .sce-render-sizer').count(),1);
  assert.equal(await page.locator('.sce-reader-body .sce-card-scroll').count(),0);
  assert.equal(await page.locator('.sce-reader-body > .sce-reader-content > [aria-hidden=true]').count(),0,'No Canvas spacers');
  const typography=()=>page.locator('.sce-reader-body').evaluate(el=>['p','h2','.badge','code'].map(selector=>{const s=getComputedStyle(el.querySelector(selector));return {size:parseFloat(s.fontSize),line:parseFloat(s.lineHeight),family:s.fontFamily,color:s.color};}));
  const fonts=await typography();assert.equal(fonts[0].size,16);assert.equal(fonts[1].size,24);assert.equal(fonts[2].size,9.6);
  assert.equal(await page.locator('.sce-reader-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  assert.ok(await page.locator('.sce-reader-body pre').evaluate(el=>el.scrollWidth>el.clientWidth));
  assert.ok(await page.locator('.sce-reader-table').evaluate(el=>el.scrollWidth>el.clientWidth));
  assert.ok(await page.locator('.sce-reader-body a[href^="https:"]').count());
  const ids=await page.evaluate(()=>Array.from(document.querySelectorAll('[id]'),e=>e.id));assert.equal(new Set(ids).size,ids.length);
  const localRef=await page.locator('.sce-reader-body a[href^="#"]').getAttribute('href');assert.ok(localRef.startsWith('#sce-reader-'));assert.equal(await page.locator('.sce-reader-body a[href^="#"]').getAttribute('aria-describedby'),localRef.slice(1));
  assert.match(await page.locator('.sce-reader-body rect').getAttribute('fill'),/^url\(#sce-reader-/);
  await page.locator('[data-reader-font="2"]').click();const larger=await typography();fonts.forEach((font,i)=>{assert.ok(Math.abs(larger[i].size/font.size-18/16)<.001);assert.equal(larger[i].family,font.family);assert.equal(larger[i].color,font.color);});
  await page.locator('[data-reader-font="-2"]').click();
  await searchFor(page,'needle');assert.match(await page.locator('.sce-search-status').textContent(),/命中 2 张 · 3 处/);
  assert.equal(await page.evaluate(()=>CSS.highlights.get('sce-reader-search').size),2);
  await page.locator('.sce-reader-body').evaluate(el=>{el.focus({preventScroll:true});const range=document.createRange();range.selectNodeContents(el.querySelector('p'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);window.readerParagraph=el.querySelector('p');});
  await page.evaluate(()=>{const input=document.querySelector('.sce-search-input input[type=search]');input.value='alpha beta';input.dispatchEvent(new InputEvent('input',{bubbles:true}));});
  await page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');assert.equal(await selected(page),'rich');assert.equal(await page.evaluate(()=>document.querySelector('.sce-reader-body p')===window.readerParagraph),true);assert.match(await page.evaluate(()=>getSelection().toString()),/needle alpha beta/);
  await page.locator('.sce-search-input input[type=search]').press('Escape');assert.equal(await selected(page),'rich');assert.equal(await page.evaluate(()=>CSS.highlights.has('sce-reader-search')),false);
  await page.locator('.sce-reader-close').click();assertView(await view(page),initialView);assert.deepEqual(await cardContent(page),original);
  await readCard(page,'long');
  await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop=900);const longPosition=await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop);
  const readingView=await view(page);const bodyBounds=await page.locator('.sce-reader-body').boundingBox();await page.mouse.move(bodyBounds.x+100,bodyBounds.y+100);await page.mouse.wheel(0,220);await settle(page);assertView(await view(page),readingView);assert.deepEqual(await cardContent(page),original);
  assert.ok(await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop)>longPosition);
  const anchor=await page.locator('.sce-reader-body').evaluate(el=>{const top=el.getBoundingClientRect().top;const p=Array.from(el.querySelectorAll('p')).find(p=>p.getBoundingClientRect().bottom>top+24);p.dataset.anchor='true';return p.getBoundingClientRect().top;});
  await page.locator('[data-reader-font="2"]').click();assert.ok(Math.abs(await page.locator('[data-anchor]').evaluate(el=>el.getBoundingClientRect().top)-anchor)<2);
  const scrolled=await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop);await readCard(page,'long');assert.equal(await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop),scrolled);
  await searchFor(page,'needle');assert.equal(await selected(page),'long');assert.equal(await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop),scrolled);
  await page.locator('.sce-search-input input[type=search]').press('Enter');assert.equal(await selected(page),'rich');await page.locator('.sce-search-input input[type=search]').press('Enter');assert.equal(await selected(page),'long');
  assert.ok(await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop>1000));assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('.sce-search-input input[type=search]')),true);
  const navScroll=await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop);await page.locator('[data-search-action=all]').click();assert.equal(await selected(page),'long');assert.equal(await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop),navScroll);
  await searchFor(page,'no-such-result');assert.equal(await selected(page),'long');assert.equal(await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop),navScroll);
  await page.locator('.sce-reader-close').click();await searchFor(page,'needle');await page.locator('.sce-search-input input[type=search]').press('Enter');assert.ok(await page.locator('.sce-reader').isHidden());
  await readCard(page,'details');assert.equal(await page.locator('.sce-card.sce-reading').getAttribute('data-node-id'),'details');assert.equal(await page.locator('[data-node-id=details]').evaluate(el=>getComputedStyle(el).opacity),'1');
  assert.equal(await page.locator('[aria-current=true]').getAttribute('data-node-id'),'rich','Manual reading does not move search selection');
  await searchFor(page,'foldedneedle');const beforeFold=await page.locator('.sce-search-status').textContent();await page.locator('.sce-reader-body summary').click();await settle(page);
  assert.equal(await page.locator('.sce-search-status').textContent(),beforeFold);assert.equal(await page.locator('[data-node-id=details] details').evaluate(el=>el.open),false);assert.equal(await page.evaluate(()=>CSS.highlights.get('sce-reader-search').size),1);
  await searchFor(page,'i̇ x');assert.equal(await page.locator('.sce-reader-body details').evaluate(el=>el.open),true);assert.equal(await page.evaluate(()=>CSS.highlights.get('sce-reader-search').size),1);
  await page.locator('.sce-reader-close').press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.closest('.sce-reader-anchor')?.dataset.readerNode),'details');
  await readCard(page,'details');assert.equal(await page.locator('.sce-reader-body details').evaluate(el=>el.open),false,'Reopening starts a fresh copy');
  await page.locator('.sce-reader-close').click();await searchFor(page,'');
  for(let i=0;i<8;i++){const prior=await view(page);await readCard(page,i%2?'long':'rich');await page.locator('.sce-reader-close').click();await settle(page);assertView(await view(page),prior);assert.equal(await page.locator('.sce-reader-body *').count(),0);assert.equal(await page.evaluate(()=>CSS.highlights.has('sce-reader-search')),false);}
  await readCard(page,'fallback');assert.equal(await page.locator('.sce-reader-content').textContent(),'Fallback text');summary.independentReader=true;summary.searchIntegration=true;summary.typographyAndReferences=true;

  // Responsive layout, source immutability, fonts, printing and keyboard recovery.
  for(const dark of [false,true]){
    await writeFile('qa/reader/theme.html',documentHTML(dark?EN:ZH,dark));await open(page,'qa/reader/theme.html');
    for(const width of [1360,900,899,650,320]){
      await page.setViewportSize({width,height:900});await settle(page);await readCard(page,'rich');
      assert.equal(await page.locator('.sce-viewport').evaluate(el=>el.inert),width<900);
      assert.equal(await page.locator('.sce-reader-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
      const bounds=await page.locator('.sce-reader').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+.1);assert.ok(bounds.height>200);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      for(let i=0;i<3;i++)await page.locator('[data-reader-font="2"]').click();assert.ok(await page.locator('[data-reader-font="2"]').isDisabled());
      assert.equal(await page.locator('.sce-reader-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
      for(let i=0;i<4;i++)await page.locator('[data-reader-font="-2"]').click();assert.ok(await page.locator('[data-reader-font="-2"]').isDisabled());await page.locator('[data-reader-font="2"]').click();
      if([1360,320].includes(width))await page.screenshot({path:`qa/reader/${dark?'dark':'light'}-${width}.png`});
      await page.locator('.sce-reader-close').click();assert.equal(await page.locator('.sce-viewport').evaluate(el=>el.inert),false);
    }
  }
  await readCard(page,'rich');await page.setViewportSize({width:1360,height:900});await settle(page);assert.equal(await page.locator('.sce-viewport').evaluate(el=>el.inert),false);
  await page.emulateMedia({media:'print'});assert.ok(await page.locator('.sce-reader').isHidden());assert.ok(await page.locator('.sce-reader-trigger').first().isHidden());assert.equal(await page.locator('.sce-card:visible').count(),fixtures.length);await page.emulateMedia({media:'screen'});
  summary.responsiveThemesAndPrint=true;
  const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,offline:true});const touchPage=await touch.newPage();watch(touchPage);await open(touchPage);
  const touchButton=touchPage.locator('[data-reader-node=rich] button');assert.equal(await touchButton.evaluate(el=>getComputedStyle(el).opacity),'1');await touchButton.tap();assert.ok(await touchPage.locator('.sce-reader').isVisible());await touchPage.locator('.sce-reader-close').tap();assert.ok(await touchPage.locator('.sce-reader').isHidden());await touch.close();summary.touch=true;
  const fallback=await browser.newContext({offline:true});await fallback.addInitScript(()=>{window.Highlight=undefined;});const fallbackPage=await fallback.newPage();watch(fallbackPage);await open(fallbackPage);await searchFor(fallbackPage,'needle');await readCard(fallbackPage,'long');assert.ok(await fallbackPage.locator('.sce-reader-body').evaluate(el=>el.scrollTop>1000));await fallback.close();summary.noHighlightFallback=true;
  const staticContext=await browser.newContext({javaScriptEnabled:false,offline:true});const staticPage=await staticContext.newPage();watch(staticPage);await staticPage.goto(pathToFileURL(resolve('qa/reader/fixture.html')).href);assert.ok(await staticPage.locator('.sce-reader').isHidden());assert.equal(await staticPage.locator('.sce-reader-trigger').count(),0);assert.equal(await staticPage.locator('.sce-card').count(),fixtures.length);await staticContext.close();summary.staticFallback=true;

  // Run the current viewer against actual frozen Obsidian/Prism markup.
  for(const file of ['qa/example-canvas.html','qa/prism-after/example-canvas.html',...(process.argv[2]?[process.argv[2]]:[])]){
    let html;try{html=await readFile(file,'utf8');}catch(error){if(file===process.argv[2])throw error;continue;}
    const production=file===process.argv[2];
    if(!production)html=html.replace(/<aside[^>]*class="sce-reader"[\s\S]*?<\/aside>/,'').replace(/<header class="sce-toolbar">[\s\S]*?<\/header>/,viewerToolbar(ZH,'Captured Canvas',25,24)).replace(/<style>[\s\S]*?(?=\.sce-s0\{)/,()=>`<style>${viewerCSS}\n`).replace(/<script>[\s\S]*?<\/script>/,()=>`<script>(${startViewer.toString()})(${JSON.stringify(ZH.searchCurrent)});</script>`);
    await writeFile('qa/reader/captured.html',html);await page.setViewportSize({width:1600,height:1000});await open(page,'qa/reader/captured.html');await settle(page);
    if(production)assert.equal(await page.locator('meta[name=generator]').getAttribute('content'),`Simple Canvas Exporter ${manifest.version}`);
    const captured=await cardContent(page);await searchFor(page,'logits');const count=await page.locator('.sce-search-match').count(),hits=await page.evaluate(()=>CSS.highlights.get('sce-search').size);assert.ok(count>0);
    const id=await page.locator('.sce-search-match').evaluateAll(cards=>cards.sort((a,b)=>b.textContent.length-a.textContent.length)[0].dataset.nodeId);await readCard(page,id);assert.deepEqual(await cardContent(page),captured);assert.equal(await page.locator('.sce-search-match').count(),count);assert.equal(await page.evaluate(()=>CSS.highlights.get('sce-search').size),hits);
    assert.equal(await page.locator('.sce-reader-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    assert.equal(await page.locator('.sce-reader-body .badge').count(),await page.locator(`[data-node-id="${id}"] .badge`).count());
    await page.screenshot({path:`qa/reader/${production?'production':file.includes('prism')?'captured-prism':'captured-default'}.png`});
    await page.locator('[data-reader-font="2"]').click();assert.deepEqual(await cardContent(page),captured);
    summary[file]={cards:await page.locator('.sce-card').count(),matchingCards:count,hits};
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile('qa/reader/results.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}finally{await browser.close();}
