import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

await mkdir('qa',{recursive:true});
const input=resolve(process.argv[2]??'qa/example-canvas.html');
const source=JSON.parse(await readFile('tests/fixtures/example.canvas','utf8'));
const reference=JSON.parse(await readFile('qa/native-reference.json','utf8'));
const nativePaths=JSON.parse(await readFile('qa/native-paths.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
  const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1.75,offline:true});
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(pathToFileURL(input).href);await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>document.querySelector('.sce-viewport')?.classList.contains('sce-interactive'));
  const metrics=await page.evaluate(()=>({
    cards:Array.from(document.querySelectorAll('.sce-card')).map(e=>({id:e.dataset.nodeId,width:parseFloat(getComputedStyle(e).width),height:parseFloat(getComputedStyle(e).height),x:parseFloat(e.style.left)-Number(document.querySelector('.sce-scene').dataset.originX),y:parseFloat(e.style.top)-Number(document.querySelector('.sce-scene').dataset.originY),text:e.textContent,scroll:e.querySelector('.sce-card-scroll').scrollHeight,client:e.querySelector('.sce-card-scroll').clientHeight})),
    edges:Array.from(document.querySelectorAll('[data-edge-id]')).map(e=>({id:e.dataset.edgeId,from:e.dataset.fromNode,to:e.dataset.toNode,path:e.querySelector('path').getAttribute('d'),source:e.dataset.pathSource,arrows:e.querySelectorAll('polygon').length})),
    badges:document.querySelectorAll('.badge').length,links:document.querySelectorAll('a.internal-link').length,
    protocols:Array.from(document.querySelectorAll('[src],[href]')).map(e=>e.getAttribute('src')??e.getAttribute('href')).filter(u=>/^(app:|obsidian:|blob:|file:)/i.test(u)),
  }));
  await writeFile('qa/browser-metrics.json',JSON.stringify(metrics,null,2));
  await page.screenshot({path:'qa/export-overview.png'});
  assert.equal(metrics.cards.length,25);assert.equal(metrics.edges.length,24);
  for(const n of source.nodes){const c=metrics.cards.find(c=>c.id===n.id);assert.ok(c,`Missing card ${n.id}`);assert.ok(Math.abs(c.width-n.width)<1);assert.ok(Math.abs(c.height-n.height)<1);assert.equal(c.x,n.x);assert.equal(c.y,n.y);}
  for(const e of source.edges){const edge=metrics.edges.find(x=>x.id===e.id);assert.equal(edge.from,e.fromNode);assert.equal(edge.to,e.toNode);assert.equal(edge.arrows,1);}
  assert.equal(metrics.links,0);assert.ok(metrics.badges>=13);assert.deepEqual(metrics.protocols,[]);
  const typography=await page.locator('.sce-card').evaluateAll(cards=>cards.map(c=>{const p=c.querySelector('p,center'),s=getComputedStyle(p);return {id:c.dataset.nodeId,width:parseFloat(s.width),font:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,paragraphMargin:s.margin};}));
  for(const native of reference){
    const exported=typography.find(c=>c.id===native.id),card=metrics.cards.find(c=>c.id===native.id);
    for(const property of ['font','fontSize','lineHeight','paragraphMargin'])assert.equal(exported[property],native[property],`${native.id} ${property}`);
    assert.ok(Math.abs(exported.width-parseFloat(native.width))<1,`${native.id} paragraph width`);
    assert.ok(Math.abs(card.scroll-native.scroll)<=2,`${native.id} scroll height: ${card.scroll} vs ${native.scroll}`);
  }
  for(const native of nativePaths)assert.equal(metrics.edges.find(e=>e.id===native.id).path,native.path,`Native path ${native.id}`);
  const long=metrics.cards.find(c=>c.id==='49632ab757a618f6');assert.ok(long.scroll>long.client,'Long card must overflow');
  await page.locator('[data-action="reset"]').click();assert.equal(await page.locator('.sce-scene').getAttribute('data-zoom'),'1');
  // Pan through real pointer input until the long card is comfortably visible at 100%.
  const card=page.locator(`[data-node-id="${long.id}"]`),target=await card.boundingBox();
  const start={x:35,y:90};
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+500-target.x,start.y+220-target.y,{steps:10});await page.mouse.up();
  const scroll=card.locator('.sce-card-scroll'),box=await scroll.boundingBox();
  const pan=await page.locator('.sce-scene').getAttribute('style');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,900);await page.waitForTimeout(300);
  const scrolled=await scroll.evaluate(e=>({top:e.scrollTop,total:e.scrollHeight,client:e.clientHeight}));
  assert.ok(scrolled.top>0,'Wheel must scroll the card');assert.ok(Math.abs(scrolled.total-scrolled.client-scrolled.top)<2,'Last line must be reachable');
  assert.equal(await page.locator('.sce-scene').getAttribute('style'),pan,'Card scrolling must not pan the scene');
  await page.mouse.wheel(0,900);await page.waitForTimeout(100);assert.equal(await page.locator('.sce-scene').getAttribute('style'),pan,'No scroll chaining at the bottom');
  await scroll.evaluate(e=>e.scrollTop=0);await page.screenshot({path:'qa/export-detail.png'});
  await page.mouse.move(box.x+30,box.y+40);await page.mouse.down();await page.mouse.move(box.x+200,box.y+60,{steps:8});await page.mouse.up();
  assert.equal(await page.locator('.sce-scene').getAttribute('style'),pan,'Selecting text must not pan');
  assert.ok(await page.evaluate(()=>String(getSelection()).length)>0,'Text must remain selectable');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  const noJS=await browser.newContext({javaScriptEnabled:false,offline:true,viewport:{width:1000,height:800}}),staticPage=await noJS.newPage();
  await staticPage.goto(pathToFileURL(input).href);assert.equal(await staticPage.locator('.sce-card').count(),25);
  assert.ok(await staticPage.locator('.sce-viewport').evaluate(e=>e.scrollWidth>e.clientWidth),'Static fallback must be scrollable');
  await page.goto(pathToFileURL(resolve('qa/fixture.html')).href);
  const variants=await page.evaluate(()=>({
    aliases:document.querySelector('[data-node-id="links"]').textContent,
    badges:Array.from(document.querySelectorAll('.badge')).map(e=>({text:e.textContent,color:getComputedStyle(e).color,display:getComputedStyle(e).display})),
    images:Array.from(document.images).map(e=>({src:e.src,decoded:e.complete&&e.naturalWidth>0})),
    arrows:document.querySelector('[data-edge-id="double"]').querySelectorAll('polygon').length,
    noArrows:document.querySelector('[data-edge-id="no-arrow"]').querySelectorAll('polygon').length,
    label:document.querySelector('.sce-edge-label').textContent,
    file:document.querySelector('[data-node-id="unknown"]').textContent,
    unsafe:!!window.SCE_UNSAFE,events:document.querySelectorAll('[onerror],[onclick],[onload]').length,
    scripts:document.querySelectorAll('script').length,
    placeholder:document.querySelector('[data-node-id="safety"]').textContent.includes('Remote placeholder'),
    tint:getComputedStyle(document.querySelector('[data-node-id="badges"] .sce-card-scroll')).backgroundColor,
  }));
  assert.ok(variants.aliases.includes('显示别名')&&variants.aliases.includes('标题别名'));
  assert.ok(variants.aliases.includes('[[code literal]]'),'Inline code must remain literal');
  assert.equal(variants.badges.length,9);assert.ok(variants.badges.every(b=>b.display==='inline-block'));
  assert.equal(new Set(variants.badges.map(b=>b.color)).size,9,'All eight badge colors and custom color must survive');
  assert.ok(variants.badges.find(b=>b.text==='自定义 & 标签').color.includes('230, 126, 34'));
  assert.equal(variants.images.length,1);assert.ok(variants.images[0].src.startsWith('data:image/png;base64,')&&variants.images[0].decoded);
  assert.equal(variants.arrows,2);assert.equal(variants.noArrows,0);assert.equal(variants.label,'Two arrows');
  assert.ok(variants.file.includes('missing.pdf'));assert.equal(variants.unsafe,false);assert.equal(variants.events,0);assert.equal(variants.scripts,1);assert.ok(variants.placeholder);
  assert.notEqual(variants.tint,'rgba(0, 0, 0, 0)','Colored card background must survive');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await writeFile('qa/variant-metrics.json',JSON.stringify(variants,null,2));
  await page.screenshot({path:'qa/export-variants.png'});
  console.log(JSON.stringify({passed:true,cards:metrics.cards.length,edges:metrics.edges.length,badges:metrics.badges,nativePaths:metrics.edges.filter(e=>e.source==='native').length,overflowCards:metrics.cards.filter(c=>c.scroll>c.client).length,offline:true,scrollAndSelection:true,staticFallback:true,nativeTypography:true,variants:true}));
} finally {await browser.close();}
