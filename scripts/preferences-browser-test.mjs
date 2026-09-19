import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

await mkdir('qa/preferences',{recursive:true});
const stub=await readFile('scripts/fixtures/obsidian-modal.mjs','utf8');
await build({stdin:{contents:`export {default as Plugin} from './src/main';export {TextFileView} from 'obsidian';`,resolveDir:process.cwd()},outfile:'qa/preferences/runtime.js',bundle:true,format:'iife',globalName:'preferencesTest',target:'es2022',define:{__QA__:'false'},plugins:[{name:'modal-adapter',setup(b){
  b.onResolve({filter:/^(obsidian|electron)$/},args=>({path:args.path,namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='obsidian'?stub:'export const shell={openPath:async()=>""};'}));
}}]});
const css=await readFile('styles.css','utf8');
await writeFile('qa/preferences/modal.html',`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px/1.5 system-ui;margin:0;background:#fff;color:#222;--text-muted:#666;--text-normal:#222;--text-error:#b00;--font-ui-small:12px;--background-primary:#fff;--background-modifier-border:#ddd}body.dark{background:#202024;color:#eee;--text-muted:#bbb;--text-normal:#eee;--text-error:#f99;--background-primary:#202024;--background-modifier-border:#555}.modal{box-sizing:border-box;padding:20px;margin:8px auto}.setting-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--background-modifier-border)}.setting-item-info{flex:1}.setting-item-control{display:flex;align-items:center;gap:8px;flex-shrink:0}.setting-item-description{font-size:12px;color:var(--text-muted)}.setting-item-control input{box-sizing:border-box;min-width:0;width:200px}button,input{font:inherit;padding:6px}h2{font-size:20px;margin-top:0}${css}</style><body></body></html>`);
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const errors=[],requests=[],summary={};
const url=pathToFileURL(resolve('qa/preferences/modal.html')).href;
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const input=(page,name)=>page.getByRole('textbox',{name,exact:true});
const toggle=(page,name)=>page.getByRole('switch',{name,exact:true});
const status=page=>page.locator('.sce-preference-status');
async function open(page){await page.evaluate(()=>plugin.commands[0].checkCallback(false));await page.locator('.sce-preferences').waitFor();}
async function reload(page){await page.evaluate(async()=>{plugin.onunload();window.plugin=new preferencesTest.Plugin(testApp);await plugin.onload();});await open(page);}
async function initialize(page,{data=null,language='zh',failRead=false}={}){
  await page.goto(url);await page.addScriptTag({path:resolve('qa/preferences/runtime.js')});
  await page.evaluate(async({data,language,failRead})=>{
    window.testLanguage=language;window.testNotices=[];window.disk=data;window.writeCalls=[];window.loadCalls=0;window.exports=[];
    window.failRead=failRead;window.failPreferences=false;window.delayPreferences=false;window.failHTML=false;window.pendingPreference=undefined;
    const view=new preferencesTest.TextFileView();view.getViewType=()=> 'canvas';view.getViewData=()=>JSON.stringify({nodes:[],edges:[]});view.file={path:'notes/original.canvas',basename:'original'};view.containerEl=document.body;window.testView=view;
    window.testApp={workspace:{getMostRecentLeaf:()=>({view:testView})},
      loadPluginData:async()=>{loadCalls++;if(window.failRead)throw Error('Cannot read preferences');return structuredClone(disk);},
      savePluginData:async value=>{writeCalls.push(structuredClone(value));if(delayPreferences)await new Promise(resolve=>{window.pendingPreference=resolve;});if(failPreferences)throw Error('Cannot write preferences');window.disk=structuredClone(value);},
      vault:{adapter:{exists:async()=>false},createFolder:async()=>{},create:async(path,html)=>{if(failHTML)throw Error('Cannot save HTML');window.exports.push({path,html});}}
    };
    window.plugin=new preferencesTest.Plugin(testApp);await plugin.onload();
  },{data,language,failRead});
  await open(page);
}
async function save(page){await button(page,'保存为默认').click();await page.waitForFunction(()=>document.querySelector('.sce-preference-status').textContent.startsWith('已保存'));}
async function exportHTML(page){const count=await page.evaluate(()=>exports.length);await button(page,'导出').click();await page.waitForFunction(count=>exports.length===count+1,count);return page.evaluate(()=>exports.at(-1).html);}
try{
  const context=await browser.newContext({viewport:{width:900,height:1100},offline:true}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(String(error)));page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
  await initialize(page);assert.equal(await page.evaluate(()=>loadCalls),1);assert.ok(await button(page,'清除默认设置').isDisabled());
  await button(page,'取消').click();await open(page);assert.equal(await page.evaluate(()=>writeCalls.length),0);
  await toggle(page,'显示作者').click();await input(page,'作者').fill('Alice & Bob');await toggle(page,'显示导出时间').click();
  await toggle(page,'背景水印').click();await input(page,'水印文字').fill('项目 <draft>');await page.getByRole('slider').fill('12');
  await input(page,'保存位置').fill('../invalid.html');await input(page,'页面标题').fill('Temporary title');await save(page);
  const expected={schemaVersion:1,exportDefaults:{showAuthor:true,author:'Alice & Bob',showTime:true,watermark:{enabled:true,text:'项目 <draft>',opacity:12}}};
  assert.deepEqual(await page.evaluate(()=>disk),expected);assert.ok(await button(page,'保存为默认').isDisabled());
  await input(page,'页面标题').fill('Another title');assert.ok(await button(page,'保存为默认').isDisabled());
  await button(page,'取消').click();await open(page);
  assert.equal(await input(page,'页面标题').inputValue(),'original');assert.equal(await input(page,'保存位置').inputValue(),'notes/original.html');
  assert.equal(await input(page,'作者').inputValue(),'Alice & Bob');assert.equal(await page.getByRole('slider').getAttribute('aria-valuetext'),'12%');
  assert.equal(await page.locator('.sce-watermark-preview g').getAttribute('fill-opacity'),'0.12');
  await input(page,'作者').fill('Temporary author');assert.match(await status(page).textContent(),/尚未保存/);
  await page.evaluate(()=>window.failHTML=true);await button(page,'导出').click();await page.waitForFunction(()=>document.querySelector('.sce-export-status').textContent.includes('Cannot save HTML'));
  assert.ok(await button(page,'保存为默认').isEnabled());assert.deepEqual(await page.evaluate(()=>disk),expected);
  await page.evaluate(()=>window.failHTML=false);const html=await exportHTML(page);assert.ok(html.includes('Temporary author'));assert.deepEqual(await page.evaluate(()=>disk),expected);
  await writeFile('qa/preferences/production.html',html);
  await button(page,'关闭').click();await page.evaluate(()=>{testView.file={path:'other/second.canvas',basename:'second'};});await reload(page);
  assert.equal(await input(page,'页面标题').inputValue(),'second');assert.equal(await input(page,'保存位置').inputValue(),'other/second.html');assert.equal(await input(page,'作者').inputValue(),'Alice & Bob');assert.equal(await page.evaluate(()=>writeCalls.length),1);
  summary.explicitPersistenceReloadTemporaryEditsAndExportRetry=true;

  await page.evaluate(()=>window.failPreferences=true);await button(page,'清除默认设置').click();await page.waitForFunction(()=>document.querySelector('.sce-preference-status').textContent.includes('未能清除'));
  assert.deepEqual(await page.evaluate(()=>disk),expected);await page.evaluate(()=>window.failPreferences=false);await button(page,'清除默认设置').click();await page.waitForFunction(()=>document.querySelector('.sce-preference-status').textContent.startsWith('已清除'));
  assert.equal(await input(page,'作者').inputValue(),'Alice & Bob');assert.equal(await input(page,'页面标题').inputValue(),'second');assert.ok(await button(page,'保存为默认').isEnabled());
  await button(page,'取消').click();await open(page);assert.equal(await input(page,'作者').inputValue(),'');assert.ok(await input(page,'作者').isDisabled());assert.ok(await page.locator('.sce-watermark-fields').isHidden());
  await toggle(page,'显示作者').click();await input(page,'作者').fill('Not saved');await page.evaluate(()=>window.failPreferences=true);
  await button(page,'保存为默认').click();await page.waitForFunction(()=>document.querySelector('.sce-preference-status').textContent.includes('未能保存'));
  assert.ok(await button(page,'导出').isEnabled());assert.ok((await exportHTML(page)).includes('Not saved'));assert.equal(await page.evaluate(()=>disk.exportDefaults),null);
  summary.clearKeepsDraftAndPersistenceFailuresDoNotBlockExports=true;

  await initialize(page);await toggle(page,'显示作者').click();await input(page,'作者').fill('Slow save');await page.evaluate(()=>window.delayPreferences=true);await button(page,'保存为默认').click();
  await page.waitForFunction(()=>typeof pendingPreference==='function');assert.ok(await button(page,'导出').isDisabled());assert.ok(await input(page,'作者').isDisabled());
  await button(page,'取消').click();await page.evaluate(()=>plugin.commands[0].checkCallback(false));assert.equal(await page.locator('.sce-preferences').count(),0);
  await page.evaluate(()=>{window.delayPreferences=false;pendingPreference();});await page.locator('.sce-preferences').waitFor();assert.equal(await input(page,'作者').inputValue(),'Slow save');
  await button(page,'清除默认设置').click();await page.waitForFunction(()=>disk.exportDefaults===null);
  // A write that fails after the dialog closes is reported without touching detached DOM.
  await input(page,'作者').fill('Failure after close');await page.evaluate(()=>{window.delayPreferences=true;window.failPreferences=true;window.pendingPreference=undefined;});await button(page,'保存为默认').click();await page.waitForFunction(()=>typeof pendingPreference==='function');
  await button(page,'取消').click();await page.evaluate(()=>pendingPreference());await page.waitForFunction(()=>testNotices.some(text=>text.includes('未能保存')));
  await page.evaluate(()=>{window.delayPreferences=false;window.failPreferences=false;});await open(page);assert.equal(await input(page,'作者').inputValue(),'');
  summary.closeDuringWriteReopenWaitsAndClosedFailuresAreReported=true;

  await initialize(page,{failRead:true});assert.match(await status(page).textContent(),/未能读取/);assert.equal(await page.evaluate(()=>writeCalls.length),0);assert.ok(await button(page,'清除默认设置').isEnabled());await save(page);assert.equal(await page.evaluate(()=>disk.schemaVersion),1);
  await initialize(page,{data:{schemaVersion:2,exportDefaults:{author:'Unknown format'}}});assert.match(await status(page).textContent(),/未能读取/);assert.equal(await page.evaluate(()=>writeCalls.length),0);
  await initialize(page,{data:{schemaVersion:1,exportDefaults:{watermark:{enabled:true,text:'😀'.repeat(41),opacity:12}}}});
  assert.ok(await page.locator('.sce-watermark-error').isVisible());await button(page,'保存为默认').click();assert.equal(await page.evaluate(()=>writeCalls.length),0);assert.ok(await input(page,'水印文字').evaluate(el=>el===document.activeElement));
  await button(page,'导出').click();assert.equal(await page.evaluate(()=>exports.length),0);await input(page,'水印文字').fill('😀'.repeat(40));await save(page);
  await toggle(page,'背景水印').click();await toggle(page,'显示作者').click();await input(page,'作者').fill('Hidden author');await toggle(page,'显示作者').click();await save(page);
  const hidden=await exportHTML(page);assert.ok(!hidden.includes('Hidden author'));assert.ok(!hidden.includes('😀'));assert.equal(await page.evaluate(()=>disk.exportDefaults.author),'Hidden author');
  summary.readRecoveryWatermarkValidationAndInactiveTextOmission=true;

  for(const language of ['zh','en'])for(const dark of [false,true]){
    await initialize(page,{data:expected,language});await page.evaluate(dark=>document.body.classList.toggle('dark',dark),dark);
    for(const width of [900,320]){await page.setViewportSize({width,height:1100});await page.screenshot({path:`qa/preferences/dialog-${language}-${dark?'dark':'light'}-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    const saveName=language==='zh'?'保存为默认':'Save as defaults';assert.ok(await button(page,saveName).isDisabled());assert.equal(await status(page).getAttribute('aria-live'),'polite');
  }
  // Generated HTML still runs without Obsidian, including background, search and reader setup.
  await page.goto(pathToFileURL(resolve('qa/preferences/production.html')).href);await page.locator('.sce-interactive').waitFor();await page.locator('.sce-background-trigger').click();await page.locator('[data-color="#202631"]').click();assert.ok(await page.locator('.sce-search').isVisible());
  assert.equal(await page.locator('meta[name=generator]').getAttribute('content'),`Simple Canvas Exporter ${JSON.parse(await readFile('manifest.json','utf8')).version}`);
  summary.languagesThemesNarrowLayoutAndStandaloneOutput=true;assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await writeFile('qa/preferences/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));await context.close();
}finally{await browser.close();}
