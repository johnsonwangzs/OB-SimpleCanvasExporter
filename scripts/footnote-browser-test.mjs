import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

await mkdir('qa/footnotes',{recursive:true});
const plugins=[{name:'language-only',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const getLanguage=()=>"en";'}));}}];
await build({stdin:{contents:"export {startViewer} from './src/viewer';export {viewerToolbar} from './src/viewer-html';export {viewerCSS} from './src/styles';export {EN} from './src/i18n';",resolveDir:process.cwd()},outfile:'qa/footnotes/runtime.mjs',bundle:true,format:'esm',plugins});
await build({stdin:{contents:"import {freezeTree,StyleBank} from './src/styles';window.footnoteTest={freezeTree,StyleBank};",resolveDir:process.cwd()},outfile:'qa/footnotes/export.js',bundle:true,format:'iife'});
const {startViewer,viewerToolbar,viewerCSS,EN}=await import(pathToFileURL(resolve('qa/footnotes/runtime.mjs')));
// Captured from Obsidian 1.14.4's MarkdownRenderer; only random ID suffixes were normalized.
const raw=await readFile('tests/fixtures/footnotes-rendered.html','utf8');
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const errors=[],requests=[],summary={};
const watch=page=>{page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});};
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const view=page=>page.evaluate(()=>{const s=document.querySelector('.sce-scene'),v=document.querySelector('.sce-viewport');return {transform:s.style.transform,top:v.scrollTop,left:v.scrollLeft,hash:location.hash};});
const activate=async link=>{await link.evaluate(el=>el.focus({preventScroll:true}));await link.press('Enter');};
const top=scroll=>scroll.evaluate(el=>el.scrollTop);
const open=async(page,file)=>{await page.goto(pathToFileURL(resolve(file)).href);await page.locator('.sce-interactive').waitFor();await settle(page);};
async function assertLinks(page){
  const report=await page.evaluate(()=>{
    const ids=Array.from(document.querySelectorAll('[id]'),e=>e.id);
    const links=Array.from(document.querySelectorAll('a[data-sce-footnote]'));
    return {unique:new Set(ids).size===ids.length,count:links.length,local:links.every(a=>{
      const root=a.closest('.sce-card-scroll,.sce-reader-body'),target=document.getElementById(a.getAttribute('href').slice(1));
      return target&&root.contains(target)&&!a.hasAttribute('target');
    })};
  });
  assert.ok(report.unique&&report.local,JSON.stringify(report));assert.ok(report.count>=6);
}
async function exercise(page,firstId,secondId){
  await assertLinks(page);
  const card=page.locator(`[data-node-id="${firstId}"]`),scroll=card.locator('.sce-card-scroll');
  const ref=card.locator('sup .footnote-link').first(),back=card.locator('.footnote-backref').first();
  for(const action of ['fit','reset','out']){
    await page.locator(`[data-action="${action}"]`).click();await scroll.evaluate(el=>el.scrollTop=0);
    const before=await view(page);
    await activate(ref);assert.ok(await top(scroll)>100);assert.deepEqual(await view(page),before);
    assert.equal(await page.evaluate(()=>document.activeElement.tagName),'LI');
    await activate(back);assert.ok(await top(scroll)<60);assert.deepEqual(await view(page),before);
    assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUP');
    // The second return arrow must reach the repeated reference, not the first one.
    await activate(ref);await activate(card.locator('.footnote-backref').nth(1));
    assert.ok(await top(scroll)>100);assert.deepEqual(await view(page),before);
    if(secondId)assert.equal(await top(page.locator(`[data-node-id="${secondId}"] .sce-card-scroll`)),0);
  }
  await activate(page.locator(`[data-reader-node="${firstId}"] button`));await settle(page);await assertLinks(page);
  const reader=page.locator('.sce-reader-body'),sourceTop=await top(scroll),before=await view(page);
  await activate(reader.locator('sup .footnote-link').first());assert.ok(await top(reader)>100);
  assert.equal(await top(scroll),sourceTop);assert.deepEqual(await view(page),before);
  await activate(reader.locator('.footnote-backref').first());assert.ok(await top(reader)<60);
  assert.equal(await top(scroll),sourceTop);assert.deepEqual(await view(page),before);
  // Reopening a reader must still give it fresh, self-contained IDs.
  await page.locator('.sce-reader-close').click();await activate(page.locator(`[data-reader-node="${firstId}"] button`));await settle(page);await assertLinks(page);
  const input=page.locator('.sce-search-input input');await input.fill('FootnoteUnique');
  await page.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('.sce-search-match').count(),secondId?2:1);
  assert.equal(await page.evaluate(()=>CSS.highlights.get('sce-search').size),secondId?2:1);
  assert.equal(await page.evaluate(()=>CSS.highlights.get('sce-reader-search').size),1);
  await activate(reader.locator('sup .footnote-link').first());
  await page.screenshot({path:`qa/footnotes/${firstId}-reader.png`});
}
try{
  const context=await browser.newContext({viewport:{width:1360,height:900},offline:true}),page=await context.newPage();watch(page);
  await page.setContent('<style>body{font:16px/1.5 system-ui}p{margin:16px 0}.markdown-preview-sizer{padding:16px}a{color:#7052bf}</style>');
  await page.addScriptTag({path:resolve('qa/footnotes/export.js')});
  const frozen=await page.evaluate(raw=>{
    window.createEl=tag=>document.createElement(tag);
    const bank=new footnoteTest.StyleBank();
    const freeze=(html,prefix)=>{const root=document.createElement('div');root.className='markdown-preview-sizer sce-render-sizer';root.innerHTML=html;document.body.append(root);const result=footnoteTest.freezeTree(root,bank,prefix);root.remove();return result;};
    const cards=['a','b'].map(id=>freeze(raw,`sce-${id}`).outerHTML);
    const edge=freeze('<section><p id="fn:a b">Encoded target</p><a class="footnote-link" href="#fn%3Aa%20b">encoded</a><a class="footnote-link" href="#missing">missing</a><a class="internal-link" href="#fn:a b">wiki</a><a href="#fn:a b">ordinary</a><a class="footnote-link" href="javascript:alert(1)">unsafe</a><form><p id="removed">removed target</p></form><a class="footnote-backref" href="#removed">removed</a><script>window.UNSAFE=true</script></section>','edge');
    return {cards,css:bank.css(),edge:edge.outerHTML,edgeLinks:Array.from(edge.querySelectorAll('a[href]'),e=>e.getAttribute('href'))};
  },raw);
  assert.deepEqual(frozen.edgeLinks,['#edge-0']);assert.doesNotMatch(frozen.edge,/<script|javascript:|<form/);assert.match(frozen.edge,/>missing<\/span>/);
  for(const html of frozen.cards){assert.match(html,/FootnoteUnique/);assert.match(html,/<strong[^>]*>bold/);assert.match(html,/<em[^>]*>italic/);assert.match(html,/<code[^>]*>code/);assert.match(html,/href="https:\/\/example.com\/" target="_blank"/);}
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${viewerCSS}body{--sce-bg:#fff;--sce-text:#222;--sce-border:#ccc;--sce-hover:#eee;--sce-accent:#7052bf}${frozen.css}</style></head><body>${viewerToolbar(EN,'Footnote regression',2,0)}<main class="sce-viewport"><div class="sce-scene" data-width="1000" data-height="1100" style="width:1000px;height:1100px">${frozen.cards.map((card,i)=>`<article class="sce-card" data-node-id="${i?'b':'a'}" data-node-type="text" style="left:${40+i*480}px;top:40px;width:430px;height:260px"><div class="sce-card-scroll" tabindex="0">${card}</div></article>`).join('')}</div></main><script>(${startViewer.toString()})(${JSON.stringify(EN.searchCurrent)});</script></body></html>`;
  await writeFile('qa/footnotes/fixture.html',html);await open(page,'qa/footnotes/fixture.html');await exercise(page,'a','b');summary.frozenFixture=true;
  await page.setViewportSize({width:390,height:844});await settle(page);
  await page.locator('.sce-search-input input').fill('');await settle(page);
  const narrowView=await view(page);await activate(page.locator('.sce-reader-body sup .footnote-link').first());assert.ok(await top(page.locator('.sce-reader-body'))>100);assert.deepEqual(await view(page),narrowView);summary.narrowReader=true;
  // Closed details should open in the chosen copy only.
  await page.evaluate(()=>{const r=document.querySelector('.sce-reader-body'),section=r.querySelector('.footnotes'),details=document.createElement('details');details.innerHTML='<summary>Notes</summary>';section.before(details);details.append(section);r.scrollTop=0;});
  await activate(page.locator('.sce-reader-body sup .footnote-link').first());assert.ok(await page.locator('.sce-reader-body details').evaluate(el=>el.open));summary.foldedDefinition=true;
  const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,offline:true}),tp=await touch.newPage();watch(tp);await open(tp,'qa/footnotes/fixture.html');
  await tp.locator('[data-reader-node=a] button').tap();await settle(tp);const touchView=await view(tp);
  await tp.locator('.sce-reader-body sup .footnote-link').first().tap();assert.ok(await top(tp.locator('.sce-reader-body'))>100);assert.deepEqual(await view(tp),touchView);await touch.close();summary.touch=true;
  const staticContext=await browser.newContext({javaScriptEnabled:false,offline:true}),sp=await staticContext.newPage();watch(sp);await sp.goto(pathToFileURL(resolve('qa/footnotes/fixture.html')).href);
  assert.equal(await sp.locator('.footnotes li').count(),4);assert.match(await sp.locator('[data-node-id=a]').textContent(),/FootnoteUnique/);await staticContext.close();summary.noScript=true;
  // Optional fresh Obsidian fixture exports exercise the real renderer and assembler.
  for(const file of process.argv.slice(2)){
    await page.setViewportSize({width:1360,height:900});await open(page,file);await exercise(page,'footnote-a','footnote-b');summary[file]=true;
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);summary.offline=true;
  await writeFile('qa/footnotes/results.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}finally{await browser.close();}
