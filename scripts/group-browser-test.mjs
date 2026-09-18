import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

// Capture with the local --qa-groups plugin first; optional argument is that vault.
const dir=resolve('qa/groups');await mkdir(dir,{recursive:true});
if(process.argv[2])for(const name of ['native.json','canvas.json','result.json','fallback-result.json','fallback.html','only.html','.html']){
  const file=name==='.html'?'qa-groups.html':`qa-groups-${name}`;
  await copyFile(join(process.argv[2],'.obsidian/plugins/simple-canvas-exporter',file),join(dir,file));
}
const json=async name=>JSON.parse(await readFile(join(dir,`qa-groups-${name}.json`),'utf8'));
const [references,data,result,extra,manifest]=await Promise.all([json('native'),json('canvas'),json('result'),json('fallback-result'),readFile('manifest.json','utf8').then(JSON.parse)]);
assert.deepEqual(result.warnings,[]);assert.equal(result.groups,3);assert.equal(result.cards,data.nodes.length-3);assert.equal(result.nativePaths,data.edges.length);
assert.equal(extra.groups,11);assert.equal(extra.cards,1);assert.equal(extra.warnings.length,1);assert.match(extra.warnings[0],/compatible curve renderer/);
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const summary={},errors=[],requests=[];
const file=name=>pathToFileURL(join(dir,name)).href;
const paint=['border-top-color','border-top-width','border-top-style','border-top-left-radius','border-right-color','border-bottom-color','border-left-color','background-color','box-shadow','opacity'];
const labelPaint=[...paint,'color','font-size','font-family','font-weight','line-height','padding-top','padding-right','padding-bottom','padding-left'];
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<.03,`${message}: ${a} != ${b}`);
try{
  const context=await browser.newContext({offline:true,viewport:{width:1600,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  const open=async name=>{await page.goto(file(name));await page.waitForSelector('.sce-interactive');};
  await open('qa-groups.html');
  assert.equal(await page.locator('meta[name=generator]').getAttribute('content'),`Simple Canvas Exporter ${manifest.version}`);
  assert.equal(await page.locator('.sce-card').count(),result.cards);assert.equal(await page.locator('.sce-group').count(),3);
  assert.equal(await page.locator('.sce-group button,.sce-group [contenteditable],.sce-group svg,.sce-group .sce-card-scroll,.sce-placeholder').count(),0);
  assert.match(await page.locator('.sce-count').textContent(),/53 cards · 3 groups · 52 connections/);
  for(const ref of references){
    const n=ref.node,group=page.locator(`.sce-group[data-node-id="${n.id}"]`);
    assert.equal(await group.locator('.sce-group-label').textContent(),n.label);
    const geometry=await group.evaluate(el=>{const s=document.querySelector('.sce-scene');return{x:parseFloat(el.style.left)-Number(s.dataset.originX),y:parseFloat(el.style.top)-Number(s.dataset.originY),width:parseFloat(el.style.width),height:parseFloat(el.style.height)};});
    for(const key of ['x','y','width','height'])close(geometry[key],n[key],`${n.label} ${key}`);
    for(const [selector,cls,properties] of [['.sce-group-frame','canvas-node-container',paint],['.sce-group-frame>div','canvas-node-content',['background-color']],['.sce-group-label','canvas-group-label',labelPaint]]){
      const actual=await group.locator(selector).evaluate((el,props)=>Object.fromEntries(props.map(k=>[k,getComputedStyle(el).getPropertyValue(k)])),properties);
      const expected=ref.elements.find(e=>e.cls===cls).style;
      for(const key of properties)assert.equal(actual[key],expected[key],`${n.label} ${selector} ${key}`);
    }
    const labelLayout=await group.evaluate(el=>{
      const scene=document.querySelector('.sce-scene'),scale=new DOMMatrix(getComputedStyle(scene).transform).a,r=el.getBoundingClientRect(),l=el.querySelector('.sce-group-label').getBoundingClientRect();
      return {x:(l.x-r.x)/scale,y:(l.y-r.y)/scale,width:l.width/scale,height:l.height/scale,top:parseFloat(el.style.top)+(l.y-r.y)/scale};
    });
    const hostRef=ref.elements[0].rect,labelRef=ref.elements.find(e=>e.cls==='canvas-group-label').rect;
    close(labelLayout.x,labelRef.x-hostRef.x,'label x');close(labelLayout.y,labelRef.y-hostRef.y,'label y');close(labelLayout.height,labelRef.height,'label height');assert.ok(labelLayout.top>=39.9);
    assert.ok(await group.locator('.sce-group-label').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Short group labels must not truncate when the browser substitutes a font.');
  }
  summary.nativeGeometryPaintAndLabels=true;
  assert.deepEqual(await page.locator('.sce-group-label').allTextContents(),['test-group-3','test-group-2','test-group-1']);
  assert.ok(await page.evaluate(()=>+getComputedStyle(document.querySelector('.sce-groups')).zIndex<+getComputedStyle(document.querySelector('.sce-edges')).zIndex));
  summary.groupLayerBehindEdgesAndCards=true;
  await page.screenshot({path:join(dir,'example-overview.png')});
  // Detail view keeps the exported geometry intact and magnifies the nested group.
  await page.evaluate(()=>{const group=[...document.querySelectorAll('.sce-group')].find(el=>el.textContent==='test-group-2'),scene=document.querySelector('.sce-scene');scene.style.transform=`translate(${-parseFloat(group.style.left)*.6+80}px,${-parseFloat(group.style.top)*.6+100}px) scale(.6)`;});
  await page.screenshot({path:join(dir,'nested-detail.png')});await page.locator('[data-action=fit]').click();
  await page.locator('.sce-search-input input').fill('test-group-1');await page.waitForFunction(()=>document.querySelector('.sce-search-status').textContent.includes('No'));
  assert.equal(await page.locator('.sce-search-match').count(),0);
  await page.locator('.sce-search-input input').fill('logits');await page.waitForFunction(()=>document.querySelectorAll('.sce-search-match').length>0);
  assert.equal(await page.locator('.sce-group.sce-search-dim,.sce-group.sce-search-match,[data-reader-node="03cf64fe3376f827"]').count(),0);
  summary.groupsExcludedFromTextSearchAndReader=true;
  await page.locator('.sce-background-trigger').click();await page.locator('.sce-background-preset[data-color="#F5F1E8"]').click();
  assert.equal(await page.locator('.sce-group-frame').first().evaluate(el=>getComputedStyle(el).borderTopColor),references[0].elements.find(e=>e.cls==='canvas-node-container').style['border-top-color']);
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('.sce-group:visible').count(),3);await page.emulateMedia({media:'screen'});
  summary.backgroundAndPrint=true;
  await open('qa-groups-fallback.html');
  assert.equal(await page.locator('.sce-group').count(),11);assert.equal(await page.locator('.sce-card').count(),1);assert.equal(await page.locator('.sce-group img,.sce-group script').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
  assert.equal(await page.locator('[data-node-id=empty] .sce-group-label').count(),0);
  assert.equal(await page.locator('[data-node-id="color-6"] .sce-group-label').textContent(),'<img src=x onerror="globalThis.injected=1"> & 中文');
  const colors=await page.locator('[data-node-id^="color-"] .sce-group-frame').evaluateAll(els=>els.map(el=>getComputedStyle(el).borderTopColor));assert.equal(new Set(colors).size,7);
  assert.equal(await page.locator('[data-node-id=inner] .sce-group-frame').evaluate(el=>getComputedStyle(el).borderTopWidth),'4px');
  const order=await page.locator('.sce-group').evaluateAll(els=>els.map(el=>el.dataset.nodeId));assert.ok(order.indexOf('outer')<order.indexOf('inner'));
  const target=await page.locator('[data-node-id=outer]').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.right-r.width*.06,y:r.bottom-r.height*.08};});
  assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('.sce-group,.sce-card'),target),null);
  const transform=await page.locator('.sce-scene').evaluate(el=>el.style.transform);await page.mouse.move(target.x,target.y);await page.mouse.down();await page.mouse.move(target.x+65,target.y+40,{steps:5});await page.mouse.up();assert.notEqual(await page.locator('.sce-scene').evaluate(el=>el.style.transform),transform);
  const zoom=await page.locator('.sce-zoom').textContent();await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control');await page.waitForFunction(old=>document.querySelector('.sce-zoom').textContent!==old,zoom);
  summary.nativeUnavailableColorsEscapingNestingAndPanning=true;
  await open('qa-groups-only.html');assert.equal(await page.locator('.sce-empty').count(),0);assert.equal(await page.locator('.sce-group').count(),1);assert.equal(await page.locator('.sce-card').count(),0);assert.ok(await page.locator('.sce-group-label').isVisible());
  summary.groupOnlyCanvas=true;
  const staticContext=await browser.newContext({javaScriptEnabled:false,offline:true}),staticPage=await staticContext.newPage();await staticPage.goto(file('qa-groups.html'));assert.equal(await staticPage.locator('.sce-group').count(),3);assert.ok(await staticPage.locator('.sce-group-frame').first().isVisible());await staticContext.close();summary.noScript=true;
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(join(dir,'results.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}finally{await browser.close();}
