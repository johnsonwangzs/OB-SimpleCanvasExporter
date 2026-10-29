import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
await mkdir('qa/fields',{recursive:true});
const plugins=[{name:'language',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const getLanguage=()=>"en";'}));}}];
await build({stdin:{contents:"export {startViewer} from './src/viewer';export {viewerToolbar} from './src/viewer-html';export {viewerCSS} from './src/styles';export {EN,ZH} from './src/i18n';",resolveDir:process.cwd()},outfile:'qa/fields/runtime.mjs',bundle:true,format:'esm',plugins});
await build({stdin:{contents:"import {renderFields} from './src/fields';import {freezeTree,StyleBank} from './src/styles';window.fieldsTest={renderFields,freezeTree,StyleBank};",resolveDir:process.cwd()},outfile:'qa/fields/export.js',bundle:true,format:'iife'});
const {startViewer,viewerToolbar,viewerCSS,EN,ZH}=await import(pathToFileURL(resolve('qa/fields/runtime.mjs')));
const badge='<span class="badge badge-green">logits-based</span>';
const raw=[
 {id:'a',html:`<p>WatME needle</p><p><strong>{sce:会议=ACL 2024}</strong> | WatME</p><p>{sce:年份=2024} {sce:主题=水印} {sce:主题=水印} {sce:主题=大模型} ${badge}</p>${'<p>Long card text</p>'.repeat(35)}<details><summary>Folded</summary><p>{sce:范围=折叠}</p></details>`},
 {id:'b',html:`<p>Other needle {sce:会议=ACL 2025} {sce:年份=2025} {sce:主题=水印} ${badge}</p>`},
 {id:'c',html:'<p>Third {sce:会议=ACL 2024} {sce:年份=2024} {sce:主题=其他}</p>'},
 {id:'plain',html:'<p>needle ACL 2024 logits-based</p>'},
 {id:'excluded',html:'<pre>{sce:忽略=代码}</pre><code>{sce:忽略=行内代码}</code><a href="https://example.com/{sce:忽略=地址}">{sce:忽略=链接}</a><p hidden>{sce:忽略=隐藏}</p><p style="display:none">{sce:忽略=不可见}</p><p>{sce:会议=} {other:会议=外部} [会议:: Dataview] {sce:外层={sce:忽略=嵌套}}</p>'},
 {id:'file',type:'file',html:'{sce:忽略=文件卡片}'},
];
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const errors=[],requests=[],summary={};
function documentHTML(cards,css='',lang=ZH){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${viewerCSS}body{--sce-bg:#fff;--sce-text:#25252b;--sce-border:#d7d7e0;--sce-hover:#f6f6fa;--sce-accent:#7052bf}p{margin:12px}.badge{color:#246345;background:#e7f4ed;display:inline-block}${css}</style></head><body>${viewerToolbar(lang,'1.4.0 — 字段筛选',cards.length,0)}<main class="sce-viewport"><div class="sce-scene" data-width="1500" data-height="760" style="width:1500px;height:760px">${cards.map((c,i)=>`<article class="sce-card" data-node-id="${c.id}" data-node-type="${c.type??'text'}" style="left:${40+i%3*480}px;top:${40+Math.floor(i/3)*350}px;width:440px;height:290px;border:1px solid #ccc"><div class="sce-card-scroll"><div class="sce-render-sizer">${c.html}</div></div></article>`).join('')}</div></main><script>(${startViewer.toString()})(${JSON.stringify(lang.searchCurrent)});</script></body></html>`;}
const ready=p=>p.waitForFunction(()=>document.querySelector('.sce-search').getAttribute('aria-busy')==='false');
const open=async(p,file)=>{await p.goto(pathToFileURL(resolve(file)).href);await p.locator('.sce-interactive').waitFor();};
const chip=(p,name,value)=>p.locator('.sce-fields-compact .sce-field-group').filter({has:p.locator('strong',{hasText:new RegExp(`^${name}$`)})}).locator('.sce-field-chip').filter({has:p.locator('.sce-badge-name',{hasText:new RegExp(`^${value}$`)})});
const matches=async(p,ids)=>{await ready(p);assert.deepEqual(await p.locator('.sce-search-match').evaluateAll(es=>es.map(e=>e.dataset.nodeId).sort()),ids.slice().sort());};
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},offline:true}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await page.setContent('<div id="host"></div>');await page.addScriptTag({path:resolve('qa/fields/export.js')});
 const frozen=await page.evaluate(raw=>{
   window.createEl=tag=>document.createElement(tag);window.createSvg=tag=>document.createElementNS('http://www.w3.org/2000/svg',tag);
   const bank=new fieldsTest.StyleBank(),host=document.getElementById('host');
   const cards=raw.map(card=>{
     const root=document.createElement('div');root.innerHTML=card.html;host.appendChild(root);
     fieldsTest.renderFields(root);const once=root.innerHTML;fieldsTest.renderFields(root);if(root.innerHTML!==once)throw Error('Non-idempotent field rendering');
     const html=fieldsTest.freezeTree(root,bank,card.id).outerHTML;root.remove();return {...card,html};
   });return {cards,css:bank.css()};
 },raw);
 assert.match(frozen.cards[0].html,/<strong[^>]*><span[^>]*data-sce-field-name="会议"[^>]*>ACL 2024<\/span><\/strong>/);
 assert.match(frozen.cards[4].html,/\[会议:: Dataview\]/);assert.doesNotMatch(frozen.cards[4].html,/data-sce-field-value="(代码|行内代码|链接|嵌套)"/);
 await writeFile('qa/fields/fixture.html',documentHTML(frozen.cards,frozen.css));await open(page,'qa/fields/fixture.html');
 assert.equal(await page.locator('.sce-fields-compact .sce-field-group').count(),4);
 assert.equal(await chip(page,'会议','ACL 2024').locator('.sce-badge-count').textContent(),'2');
 assert.equal(await chip(page,'主题','水印').locator('.sce-badge-count').textContent(),'2');
 const source=await page.locator('[data-node-id=a] .sce-card-scroll').innerHTML();
 await chip(page,'会议','ACL 2024').click();await matches(page,['a','c']);
 await chip(page,'会议','ACL 2025').click();await matches(page,['a','b','c']);
 await chip(page,'年份','2024').click();await matches(page,['a','c']);
 await page.locator('.sce-badge-chips button').click();await matches(page,['a']);
 await page.locator('.sce-search-input input').fill('needle');await matches(page,['a']);
 await page.locator('.sce-search-input input').press('Escape');await matches(page,['a']);
 await page.locator('.sce-badge-reset').click();await matches(page,['a','c']);
 await page.locator('.sce-fields-reset').click();await matches(page,[]);
 // Decorations are removed without mutating field contents or their source positions.
 assert.equal(await page.locator('[data-node-id=a] .sce-card-scroll').innerHTML(),source);
 assert.ok(source.includes('data-sce-field-name'));
 summary.catalogAndCombinedFilters=true;
 await chip(page,'范围','折叠').click();await matches(page,['a']);assert.equal(await page.locator('[data-node-id=a] details[open]').count(),0);
 await page.locator('.sce-search-input input').press('Enter');assert.equal(await page.locator('[data-node-id=a] details[open]').count(),1);assert.ok(await page.locator('[data-node-id=a] .sce-card-scroll').evaluate(e=>e.scrollTop>100));
 await page.locator('[data-reader-node=a] button').evaluate(e=>e.focus());await page.locator('[data-reader-node=a] button').press('Enter');
 const count=await chip(page,'会议','ACL 2024').locator('.sce-badge-count').textContent();assert.equal(count,'2');
 await page.locator('.sce-fields-reset').click();await ready(page);await chip(page,'会议','ACL 2025').click();await matches(page,['b']);assert.ok(await page.locator('.sce-reader-excluded').isVisible());
 await page.locator('.sce-fields-more').click();await page.locator('.sce-fields-find').fill('不存在');assert.ok(await page.locator('.sce-fields-empty').isVisible());
 await page.locator('.sce-fields-find').fill('2024');assert.equal(await page.locator('.sce-fields-popup .sce-field-chip:visible').count(),2);
 await page.locator('.sce-fields-find').press('Escape');assert.ok(await page.locator('.sce-fields-popup').isHidden());assert.ok(await page.locator('.sce-reader').isVisible());
 await page.locator('.sce-reader-close').click();await page.locator('.sce-fields-reset').click();await ready(page);
 await page.locator('.sce-fields-more').click();await page.locator('.sce-badge-more').click();assert.ok(await page.locator('.sce-fields-popup').isHidden());await page.locator('.sce-badge-close').click();
 await chip(page,'会议','ACL 2025').click();await page.locator('.sce-search-input input').fill('no such text');await matches(page,[]);assert.equal(await page.locator('.sce-search-dim').count(),0);
 await page.locator('.sce-search-input input').press('Escape');await matches(page,['b']);summary.navigationReaderAndPopups=true;
 for(const width of [1440,736,320]){await page.setViewportSize({width,height:900});if(await page.locator('.sce-fields-reset').isEnabled())await page.locator('.sce-fields-reset').click();await ready(page);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`qa/fields/fields-${width}.png`});}
 await page.emulateMedia({media:'print'});assert.equal(await page.locator('.sce-fields').evaluate(e=>getComputedStyle(e.closest('header')).display),'none');await page.emulateMedia({media:'screen'});
 const staticPage=await browser.newPage({javaScriptEnabled:false,offline:true});await openStatic(staticPage);await staticPage.close();
 async function openStatic(p){await p.goto(pathToFileURL(resolve('qa/fields/fixture.html')).href);assert.ok(await p.locator('.sce-fields').isHidden());assert.equal(await p.locator('[data-node-id=a] strong .sce-field').textContent(),'ACL 2024');}
 await writeFile('qa/fields/no-fields.html',documentHTML([{id:'plain',html:'<p>Plain content</p>'}],'',EN));await open(page,'qa/fields/no-fields.html');assert.ok(await page.locator('.sce-fields').isHidden());
 const long='Very long 中文字段值 '.repeat(20),many=Array.from({length:40},(_,i)=>`<span class="sce-field" data-sce-field-name="Field ${i}" data-sce-field-value="${i===39?long:'Value'}">${i===39?long:'Value'}</span>`).join(' ');
 await writeFile('qa/fields/many.html',documentHTML([{id:'many',html:many}],'body{--sce-bg:#202024;--sce-text:#eee;--sce-border:#555;--sce-hover:#303038;--sce-accent:#b49bec;color-scheme:dark}',EN));await open(page,'qa/fields/many.html');
 assert.equal(await page.locator('.sce-fields-compact .sce-field-group').count(),40);
 assert.ok(await page.locator('.sce-fields-compact').evaluate(e=>e.clientHeight<=141&&e.scrollHeight>e.clientHeight));
 await page.locator('.sce-fields-more').click();await page.locator('.sce-fields-find').fill('Field 39');const longButton=page.locator('.sce-fields-popup .sce-field-chip:visible');
 await longButton.focus();await longButton.press('Space');await matches(page,['many']);assert.equal(await longButton.getAttribute('aria-pressed'),'true');
 await page.locator('.sce-fields-popup').getByRole('button',{name:'Field 39 · Reset this field',exact:true}).click();await matches(page,[]);
 await longButton.press('Space');await matches(page,['many']);await page.locator('.sce-fields-find').press('Escape');assert.ok(await page.locator('.sce-fields-more').evaluate(e=>e===document.activeElement));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'qa/fields/many-dark-320.png'});
 const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,offline:true}),touchPage=await touch.newPage();await open(touchPage,'qa/fields/fixture.html');
 assert.ok(await chip(touchPage,'会议','ACL 2024').evaluate(e=>e.getBoundingClientRect().height>=44));await chip(touchPage,'会议','ACL 2024').tap();await matches(touchPage,['a','c']);await touch.close();
 const fallback=await browser.newContext({offline:true}),fallbackPage=await fallback.newPage();await fallbackPage.addInitScript(()=>{globalThis.Highlight=undefined;});await open(fallbackPage,'qa/fields/fixture.html');await chip(fallbackPage,'会议','ACL 2024').click();await matches(fallbackPage,['a','c']);await fallback.close();
 summary.largeCatalogKeyboardTouchAndFallback=true;
 for(const file of process.argv.slice(2)){
   await page.setViewportSize({width:1440,height:1000});await open(page,file);assert.equal(await page.locator('.sce-fields-compact .sce-field-group').count(),3);
   await chip(page,'会议','ACL 2024').click();await matches(page,['paper-a']);await page.screenshot({path:'qa/fields/native-export.png'});summary.nativeExport=true;
 }
 summary.responsivePrintStaticAndNoFields=true;assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile('qa/fields/results.json',JSON.stringify(summary,null,2));console.log(summary);
}finally{await browser.close();}
