import test from 'node:test';
import assert from 'node:assert/strict';
import {exportPreferences,readPreferences,PreferenceStore} from '../qa/preferences.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
test('preferences whitelist excludes per-export fields and retains inactive text',()=>{
  const source={title:'Private title',path:'private.canvas',showAuthor:false,author:' Alice\n & Bob ',showTime:true,watermark:{enabled:false,text:' Hidden\n draft ',opacity:12}};
  const value=exportPreferences(source);
  assert.deepEqual(value,{showAuthor:false,author:'Alice & Bob',showTime:true,watermark:{enabled:false,text:'Hidden draft',opacity:12}});
  source.watermark.text='changed';assert.equal(value.watermark.text,'Hidden draft');
  assert.deepEqual(exportPreferences(),{showAuthor:false,author:'',showTime:false,watermark:{enabled:false,text:'',opacity:8}});
});
test('missing data, unknown formats and damaged fields have distinct safe fallbacks',()=>{
  for(const raw of [null,undefined,{schemaVersion:1,exportDefaults:null}])assert.deepEqual(readPreferences(raw),{defaults:null});
  for(const raw of [false,[],{}, {schemaVersion:2,exportDefaults:{}},{schemaVersion:1,exportDefaults:[]}])assert.deepEqual(readPreferences(raw),{defaults:null,issue:'invalid'});
  assert.deepEqual(readPreferences({schemaVersion:1,exportDefaults:{}}),{defaults:exportPreferences()});
  const damaged=readPreferences({schemaVersion:1,exportDefaults:{showAuthor:'true',author:42,showTime:true,watermark:{enabled:true,text:'  Correct\n text ',opacity:100}}});
  assert.equal(damaged.issue,'invalid');assert.deepEqual(damaged.defaults,{showAuthor:false,author:'',showTime:true,watermark:{enabled:true,text:'Correct text',opacity:16}});
  for(const [raw,expected] of [[NaN,8],[Infinity,8],['12',8],[3,4],[20,16],[8.7,9]]){
    const state=readPreferences({schemaVersion:1,exportDefaults:{watermark:{opacity:raw}}});
    assert.equal(state.defaults.watermark.opacity,expected);assert.equal(state.issue,'invalid');
  }
});
test('invalid enabled watermark stays visible, while inactive drafts and Unicode are preserved',()=>{
  for(const text of ['', '😀'.repeat(41)]){
    const state=readPreferences({schemaVersion:1,exportDefaults:{watermark:{enabled:true,text}}});
    assert.equal(state.issue,'invalid');assert.equal(state.defaults.watermark.enabled,true);assert.equal(state.defaults.watermark.text,text);
  }
  const text='😀'.repeat(40);
  assert.equal(readPreferences({schemaVersion:1,exportDefaults:{watermark:{enabled:true,text}}}).issue,undefined);
  assert.equal(readPreferences({schemaVersion:1,exportDefaults:{watermark:{enabled:false,text:'x'.repeat(41)}}}).issue,undefined);
});
test('reads and drafts do not write; saved data survives new instances and stays isolated by vault',async()=>{
  let disk=null,writes=0;
  const load=async()=>structuredClone(disk),save=async value=>{writes++;disk=structuredClone(value);};
  const store=new PreferenceStore(load,save);await store.load();assert.deepEqual(await store.read(),{defaults:null});assert.equal(writes,0);
  const draft=exportPreferences({author:'Alice',showAuthor:true,watermark:{text:'<private>',enabled:false}});
  await store.save(draft);draft.watermark.text='modified';
  const state=await store.read();state.defaults.author='changed';assert.equal((await store.read()).defaults.author,'Alice');
  const reopened=new PreferenceStore(load,save);await reopened.load();assert.equal((await reopened.read()).defaults.watermark.text,'<private>');
  const otherVault=new PreferenceStore(async()=>null,async()=>{throw Error('Unexpected write');});await otherVault.load();assert.equal((await otherVault.read()).defaults,null);
  await store.save(null);assert.deepEqual(disk,{schemaVersion:1,exportDefaults:null});assert.equal(writes,2);
});
test('pending writes serialize, reopening waits, and failures preserve confirmed state without poisoning retries',async()=>{
  const gate=deferred(),events=[];let first=true;
  const store=new PreferenceStore(async()=>null,async data=>{events.push(data.exportDefaults?.author??'clear');if(first){first=false;await gate.promise;}});
  await store.load();const source=exportPreferences({author:'First'});const saving=store.save(source);source.author='late mutation';
  let readFinished=false;const reopening=store.read().then(value=>{readFinished=true;return value;});
  await Promise.resolve();assert.equal(readFinished,false);assert.deepEqual(events,['First']);
  const clearing=store.save(null);gate.resolve();await saving;await reopening;await clearing;
  assert.deepEqual(events,['First','clear']);assert.deepEqual(await store.read(),{defaults:null});

  let failing=false;
  const retry=new PreferenceStore(async()=>null,async()=>{if(failing)throw Error('Disk unavailable');});await retry.load();
  await retry.save(exportPreferences({author:'Confirmed'}));failing=true;
  await assert.rejects(retry.save(exportPreferences({author:'Not saved'})),/Disk unavailable/);
  await assert.rejects(retry.save(null),/Disk unavailable/);assert.equal((await retry.read()).defaults.author,'Confirmed');
  failing=false;await retry.save(exportPreferences({author:'Retried'}));assert.equal((await retry.read()).defaults.author,'Retried');
});
test('load failures do not write or block explicit recovery; invalid enabled preferences cannot be saved',async()=>{
  let writes=0;
  const store=new PreferenceStore(async()=>{throw Error('Unreadable');},async()=>{writes++;});await store.load();
  assert.deepEqual(await store.read(),{defaults:null,issue:'load'});assert.equal(writes,0);
  await assert.rejects(store.save(exportPreferences({watermark:{enabled:true,text:''}})),/Invalid watermark/);assert.equal(writes,0);
  await store.save(null);assert.deepEqual(await store.read(),{defaults:null});assert.equal(writes,1);
});
