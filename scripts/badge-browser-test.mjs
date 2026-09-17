import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

await mkdir('qa/badges',{recursive:true});
const plugins=[{name:'language-only',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const getLanguage=()=>"en";'}));}}];
await build({stdin:{contents:`export {startViewer} from './src/viewer';export {viewerToolbar} from './src/viewer-html';export {viewerCSS} from './src/styles';export {EN,ZH} from './src/i18n';`,resolveDir:process.cwd()},outfile:'qa/badges/runtime.mjs',bundle:true,format:'esm',target:'es2022',minifySyntax:true,plugins});
await build({stdin:{contents:`import {freezeTree,StyleBank,ensureBadges} from './src/styles';window.exportTest={freezeTree,StyleBank,ensureBadges};`,resolveDir:process.cwd()},outfile:'qa/badges/export.js',bundle:true,format:'iife',target:'es2022'});
const {startViewer,viewerToolbar,viewerCSS,ZH,EN}=await import(pathToFileURL(resolve('qa/badges/runtime.mjs')).href);
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
const span=(name,color,style='')=>`<span class="badge badge-${color}" style="${style}">${name}</span>`;
const rawCards=[
  {id:'a',html:`<p>needle needle ${span('Topic','red')} ${span('Topic','red','font-size:24px')}</p>${'<p>Long content for scrolling</p>'.repeat(35)}<details><summary>Fold</summary><details><summary>Nested</summary><p>${span('Folded','blue')}</p></details></details>`},
  {id:'b',html:`<p>needle ${span('Topic','red')} ${span('Topic','green')} ${span('A&amp;B 🐈','custom','--simple-badge-color:#ABC')}</p>`},
  {id:'c',html:`<p>needle ${span('Topic','green')} ${span('A&amp;B 🐈','custom','--simple-badge-color:#aabbcc')} ${span('A&amp;B 🐈','custom','--simple-badge-color:#123456')}</p>`},
  {id:'plain',html:'<p>needle Topic Folded A&amp;B 🐈</p>'},
  {id:'excluded',html:`<pre>${span('Code','pink')}</pre><code>${span('Inline code','pink')}</code><div hidden>${span('Hidden','pink')}</div><div aria-hidden="true">${span('Aria','pink')}</div><div style="display:none">${span('Display','pink')}</div><div style="opacity:0">${span('Transparent','pink')}</div><div style="visibility:hidden">${span('Invisible','pink')}</div><div class="sce-placeholder">${span('Placeholder','pink')}</div>${span('   ','pink')}<p>${span('Topic','custom','--simple-badge-color:#ff0000')} ${span('topic','red')} ${span(' Topic ','red')} ${span('A  B','cyan')}</p>`},
  {id:'file',type:'file',html:span('File','pink')},
];
function documentHTML(cards,css='',lang=ZH,dark=false){
  const nodes=cards.map((c,i)=>`<article class="sce-card" data-node-id="${c.id}" data-node-type="${c.type??'text'}" style="left:${40+(i%3)*470}px;top:${40+Math.floor(i/3)*330}px;width:430px;height:270px;z-index:${i+2};border:1px solid var(--sce-border);border-radius:8px"><div class="sce-card-scroll" tabindex="0"><div class="sce-render-sizer">${c.html}</div></div></article>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="Simple Canvas Exporter ${manifest.version}"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';img-src data:"><style>${viewerCSS}body{--sce-bg:${dark?'#202024':'#fff'};--sce-text:${dark?'#eeeef3':'#25252b'};--sce-border:${dark?'#474752':'#d7d7e0'};--sce-hover:${dark?'#29292f':'#f6f6fa'};--sce-accent:${dark?'#b49bec':'#7052bf'};color-scheme:${dark?'dark':'light'}}p{margin:12px}.badge{color:#246345;background:#e7f4ed;display:inline-block;border-radius:4px;padding:1px 5px}${css}</style></head><body>${viewerToolbar(lang,'Badge regression',cards.length,1)}<main class="sce-viewport" tabindex="0"><div class="sce-scene" data-width="1490" data-height="740" style="width:1490px;height:740px"><svg class="sce-edges"><path data-from-node="a" data-to-node="b" d="M 470 175 L 510 175" stroke="gray"/></svg>${nodes}</div></main><script>(${startViewer.toString()})(${JSON.stringify(lang.searchCurrent)});</script></body></html>`;
}
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const errors=[],requests=[],summary={};
const watch=page=>{page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});};
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const ready=page=>page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');
const keyword=page=>page.locator('.sce-search-input input');
const mainChips=page=>page.locator('.sce-badge-chips .sce-badge-chip');
const chip=(page,name)=>page.locator('.sce-badge-chips').getByRole('button',{name,exact:true});
const ids=page=>page.locator('.sce-search-match').evaluateAll(els=>els.map(e=>e.dataset.nodeId).sort());
async function matches(page,expected,hits=0){await ready(page);assert.deepEqual(await ids(page),expected.slice().sort());assert.equal(await page.evaluate(()=>CSS.highlights.get('sce-search')?.size??0),hits);}
const view=page=>page.evaluate(()=>{const s=document.querySelector('.sce-scene'),v=document.querySelector('.sce-viewport'),z=+s.dataset.zoom;return {z,cx:(v.clientWidth/2-s.dataset.panX)/z,cy:(v.clientHeight/2-s.dataset.panY)/z};});
const source=page=>page.locator('.sce-card').evaluateAll(els=>els.map(el=>({html:el.querySelector('.sce-card-scroll').innerHTML,top:el.querySelector('.sce-card-scroll').scrollTop,geometry:el.getAttribute('style')})));
const open=async(page,file)=>{await page.goto(pathToFileURL(resolve(file)).href);await page.locator('.sce-interactive').waitFor();await settle(page);};
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},offline:true}),page=await context.newPage();watch(page);
  // Run the production sanitizer/fallback with only the exporter's CSS, no SimpleBadge code or CSS.
  await page.setContent(`<style>${await readFile('styles.css','utf8')}body{--text-normal:#222;--background-modifier-border:#ddd;--color-red:#ff0000;--color-green:#008000;--color-blue:#0000ff;--color-cyan:#008888;--color-pink:#ff00ff}</style><div class="sce-staging"></div>`);
  await page.addScriptTag({path:resolve('qa/badges/export.js')});
  const frozen=await page.evaluate(cards=>{
    window.createEl=tag=>document.createElement(tag);window.createSvg=tag=>document.createElementNS('http://www.w3.org/2000/svg',tag);
    window.createSpan=opts=>{const el=document.createElement('span');el.className=opts.cls;el.textContent=opts.text;return el;};
    HTMLElement.prototype.addClass=function(cls){this.classList.add(cls);};HTMLElement.prototype.setCssProps=function(props){for(const [k,v] of Object.entries(props))this.style.setProperty(k,v);};
    const host=document.querySelector('.sce-staging'),bank=new exportTest.StyleBank(),fallback=[];
    const result=cards.map(card=>{const root=document.createElement('div');root.innerHTML=card.html;host.appendChild(root);fallback.push(exportTest.ensureBadges(root));const html=exportTest.freezeTree(root,bank,card.id).outerHTML;root.remove();return {...card,html};});
    return {cards:result,css:bank.css(),fallback};
  },rawCards);
  assert.equal(frozen.fallback[3],false);assert.equal(frozen.fallback[0],true);
  assert.match(frozen.cards[1].html,/data-sce-badge-color-kind="custom" data-sce-badge-color="#aabbcc"/);
  assert.doesNotMatch(frozen.cards[1].html,/--simple-badge-color/);
  await writeFile('qa/badges/fixture.html',documentHTML(frozen.cards,frozen.css));await open(page,'qa/badges/fixture.html');
  assert.equal(await mainChips(page).count(),8);
  const labels=await mainChips(page).evaluateAll(els=>els.map(e=>e.getAttribute('aria-label')));
  assert.deepEqual(labels.slice(0,3),['Topic · 红色 · 3 张卡片','Topic · 绿色 · 2 张卡片','A&B 🐈 · #aabbcc · 2 张卡片']);
  assert.ok(labels.includes('Topic · #ff0000 · 1 张卡片'),'Theme and custom stay distinct');
  const red=()=>chip(page,'Topic · 红色 · 3 张卡片'),green=()=>chip(page,'Topic · 绿色 · 2 张卡片');
  const original=await source(page),initial=await view(page);
  await red().click();await matches(page,['a','b','excluded']);assert.equal(await keyword(page).inputValue(),'');
  assert.equal(await page.locator('.sce-search-status').textContent(),'符合条件 3 张');
  assert.deepEqual(await source(page),original);assert.deepEqual(await view(page),initial);
  await green().click();await matches(page,['a','b','c','excluded']);
  await page.locator('.sce-badge-mode').selectOption('all');await matches(page,['b']);
  await keyword(page).fill('needle');await matches(page,['b'],1);
  assert.equal(await page.locator('.sce-search-status').textContent(),'符合条件 1 张 · 关键词 1 处');
  await keyword(page).press('Escape');await matches(page,['b']);assert.equal(await page.locator('.sce-badge-mode').inputValue(),'all');
  await keyword(page).fill('needle');await matches(page,['b'],1);
  await page.locator('.sce-badge-reset').click();await matches(page,['a','b','c','plain'],5);assert.equal(await page.locator('.sce-badge-mode').inputValue(),'any');
  await red().click();await matches(page,['a','b'],3);
  await keyword(page).fill('notfound');await matches(page,[]);assert.equal(await page.locator('.sce-search-dim,.sce-search-ring').count(),0);
  await keyword(page).press('Escape');await matches(page,['a','b','excluded']);
  assert.deepEqual(await mainChips(page).evaluateAll(els=>els.map(e=>e.getAttribute('aria-label'))),labels);
  summary.catalogIdentityAndCombinedFilters=true;

  // Reader copies never join the catalog; filtering preserves the open source and scroll.
  await page.locator('[data-reader-node=a] button').evaluate(el=>el.focus({preventScroll:true}));await page.locator('[data-reader-node=a] button').press('Enter');
  await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop=250);
  await page.locator('.sce-badge-reset').click();await ready(page);await green().click();await matches(page,['b','c']);
  assert.equal(await page.locator('.sce-reader').getAttribute('data-source'),'a');assert.equal(await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop),250);assert.ok(await page.locator('.sce-reader-excluded').isVisible());
  await keyword(page).fill('needle');await matches(page,['b','c'],2);assert.equal(await page.evaluate(()=>CSS.highlights.get('sce-reader-search').size),2);
  await page.locator('.sce-badge-more').click();assert.ok(await page.locator('.sce-badge-popup').isVisible());
  await page.locator('.sce-badge-find').fill('fold');assert.equal(await page.locator('.sce-badge-list button:visible').count(),1);assert.equal(await keyword(page).inputValue(),'needle');
  await page.locator('.sce-badge-find').press('Escape');assert.ok(await page.locator('.sce-badge-popup').isHidden());assert.ok(await page.locator('.sce-reader').isVisible());assert.equal(await keyword(page).inputValue(),'needle');
  await keyword(page).press('Escape');await matches(page,['b','c']);await page.locator('.sce-badge-reset').click();await ready(page);
  await chip(page,'Folded · 蓝色 · 1 张卡片').click();await matches(page,['a']);assert.equal(await page.locator('[data-node-id=a] details[open]').count(),0);
  await keyword(page).press('Enter');await ready(page);await settle(page);
  assert.equal(await page.locator('[data-node-id=a][aria-current=true]').count(),1);assert.equal(await page.locator('[data-node-id=a] details[open]').count(),2);
  assert.equal(await page.locator('.sce-reader-body details[open]').count(),2);assert.ok(await page.locator('[data-node-id=a] .sce-card-scroll').evaluate(el=>el.scrollTop>500));
  assert.ok(await page.locator('.sce-reader-body').evaluate(el=>el.scrollTop>500));assert.equal(await mainChips(page).count(),8);
  assert.match(await page.locator('.sce-search-status').textContent(),/当前 1\/1/);
  await page.locator('.sce-reader-close').click();await page.screenshot({path:'qa/badges/light.png'});summary.readerAndFoldedNavigation=true;

  // No Badge content leaves the existing viewer intact, including search and reading.
  await writeFile('qa/badges/no-badges.html',documentHTML([{id:'plain',html:'<p>needle no badges here</p>'}]));await open(page,'qa/badges/no-badges.html');
  assert.ok(await page.locator('.sce-badge-filter').isHidden());assert.ok(await page.locator('.sce-badge-popup').isHidden());assert.equal(await mainChips(page).count(),0);
  await keyword(page).fill('needle');await matches(page,['plain'],1);await keyword(page).press('Enter');assert.equal(await page.locator('[aria-current=true]').count(),1);summary.noPluginAndNoBadges=true;

  const many=[{id:'many',html:Array.from({length:70},(_,i)=>span(i===69?'Very long 中文标签 '.repeat(18):`Badge ${String(i).padStart(2,'0')}`,'green')).join(' ')}];
  await writeFile('qa/badges/many.html',documentHTML(many,'',EN,true));await open(page,'qa/badges/many.html');
  for(const width of [1440,736,320]){
    await page.setViewportSize({width,height:900});await settle(page);
    const rows=await mainChips(page).evaluateAll(els=>new Set(els.filter(e=>!e.hidden).map(e=>e.offsetTop)).size);assert.ok(rows<=2);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('.sce-badge-more').click();await page.locator('.sce-badge-find').fill('Very long');const last=page.locator('.sce-badge-list button:visible');await last.click();await matches(page,['many']);
    await page.locator('.sce-badge-find').press('Escape');assert.equal(await page.locator('.sce-badge-selected').textContent(),'1 selected');
    await page.screenshot({path:`qa/badges/dark-${width}.png`});await page.locator('.sce-badge-reset').click();await ready(page);
  }
  await page.locator('.sce-badge-more').click();await page.emulateMedia({media:'print'});assert.equal(await page.locator('.sce-badge-popup').evaluate(e=>getComputedStyle(e).display),'none');await page.emulateMedia({media:'screen'});
  await page.locator('.sce-badge-close').click();await page.locator('.sce-badge-chips button:visible').first().focus();await page.keyboard.press('Space');await matches(page,['many']);
  summary.responsiveCatalogKeyboardAndPrint=true;
  const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,offline:true}),touchPage=await touch.newPage();watch(touchPage);await open(touchPage,'qa/badges/many.html');
  assert.ok(await mainChips(touchPage).first().evaluate(el=>el.getBoundingClientRect().height>=44));await mainChips(touchPage).first().tap();await matches(touchPage,['many']);await touchPage.screenshot({path:'qa/badges/touch.png'});await touch.close();
  const noHighlight=await browser.newContext({offline:true}),fallback=await noHighlight.newPage();watch(fallback);await fallback.addInitScript(()=>{globalThis.Highlight=undefined;});await open(fallback,'qa/badges/fixture.html');await chip(fallback,'Topic · 红色 · 3 张卡片').click();await matches(fallback,['a','b','excluded']);await keyword(fallback).press('Enter');assert.equal(await fallback.locator('[aria-current=true]').count(),1);await noHighlight.close();
  const staticContext=await browser.newContext({javaScriptEnabled:false,offline:true}),staticPage=await staticContext.newPage();await staticPage.goto(pathToFileURL(resolve('qa/badges/fixture.html')).href);assert.ok(await staticPage.locator('.sce-badge-filter').isHidden());assert.equal(await staticPage.locator('.sce-card').count(),6);await staticContext.close();summary.touchHighlightAndStaticFallbacks=true;

  for(const file of process.argv.slice(2)){
    await page.setViewportSize({width:1600,height:1000});await open(page,file);assert.equal(await page.locator('meta[name=generator]').getAttribute('content'),`Simple Canvas Exporter ${manifest.version}`);assert.equal(await mainChips(page).count(),5);
    const logits=mainChips(page).filter({has:page.locator('.sce-badge-name',{hasText:/^logits-based$/})});await logits.click();await ready(page);assert.equal(await page.locator('.sce-search-match').count(),5);
    await keyword(page).fill('logits');await ready(page);assert.equal(await page.locator('.sce-search-match').count(),5);assert.equal(await page.evaluate(()=>CSS.highlights.get('sce-search').size),7);
    await keyword(page).press('Escape');await ready(page);await page.locator('.sce-badge-reset').click();await ready(page);
    await mainChips(page).filter({has:page.locator('.sce-badge-name',{hasText:/^sampling-based$/})}).click();await ready(page);await mainChips(page).filter({has:page.locator('.sce-badge-name',{hasText:/^distortion-free$/})}).click();await ready(page);assert.equal(await page.locator('.sce-search-match').count(),3);
    await page.locator('.sce-badge-mode').selectOption('all');await ready(page);assert.equal(await page.locator('.sce-search-match').count(),1);await keyword(page).press('Enter');await page.screenshot({path:`qa/badges/production-${Object.keys(summary).length}.png`});summary[file]={badges:5,keywordCards:5,keywordHits:7,anyCards:3,allCards:1};
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile('qa/badges/results.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}finally{await browser.close();}
