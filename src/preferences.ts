import { type ExportOptions } from './metadata';
import { watermarkProblem } from './watermark';

export interface ExportPreferences {
  showAuthor:boolean;
  author:string;
  showTime:boolean;
  watermark:{enabled:boolean;text:string;opacity:number};
}
export interface PreferenceState { defaults:ExportPreferences|null; issue?:'load'|'invalid' }
export interface PreferenceActions {
  initial:PreferenceState;
  save:(value:ExportPreferences|null)=>Promise<PreferenceState>;
}
interface PluginData { schemaVersion:1; exportDefaults:ExportPreferences|null }
const line=(value:string)=>value.trim().replace(/\s+/gu,' ');
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);

/** Explicit whitelist: titles, paths, timestamps and hidden exporter state are never stored. */
export function exportPreferences(options:ExportOptions={}):ExportPreferences {
  const opacity=options.watermark?.opacity;
  return {
    showAuthor:options.showAuthor??false,author:line(options.author??''),showTime:options.showTime??false,
    watermark:{enabled:options.watermark?.enabled??false,text:line(options.watermark?.text??''),
      opacity:typeof opacity==='number'&&Number.isFinite(opacity)?Math.max(4,Math.min(16,Math.round(opacity))):8},
  };
}

export function readPreferences(raw:unknown):PreferenceState {
  if(raw===null||raw===undefined)return {defaults:null};
  if(!record(raw)||raw.schemaVersion!==1)return {defaults:null,issue:'invalid'};
  if(raw.exportDefaults===null||raw.exportDefaults===undefined)return {defaults:null};
  if(!record(raw.exportDefaults))return {defaults:null,issue:'invalid'};
  const saved=raw.exportDefaults;
  let invalid=false;
  const boolean=(obj:Record<string,unknown>,key:string)=>{
    if(obj[key]===undefined)return false;
    if(typeof obj[key]==='boolean')return obj[key];
    invalid=true;return false;
  };
  const string=(obj:Record<string,unknown>,key:string)=>{
    if(obj[key]===undefined)return '';
    if(typeof obj[key]==='string')return obj[key];
    invalid=true;return '';
  };
  const watermark=record(saved.watermark)?saved.watermark:{};
  if(saved.watermark!==undefined&&!record(saved.watermark))invalid=true;
  const opacity=watermark.opacity;
  if(opacity!==undefined&&(typeof opacity!=='number'||!Number.isFinite(opacity)||opacity<4||opacity>16||!Number.isInteger(opacity)))invalid=true;
  const defaults=exportPreferences({showAuthor:boolean(saved,'showAuthor'),author:string(saved,'author'),showTime:boolean(saved,'showTime'),
    watermark:{enabled:boolean(watermark,'enabled'),text:string(watermark,'text'),opacity:typeof opacity==='number'?opacity:8}});
  // Keep invalid enabled watermarks visible so the user can correct them, never silently omit one.
  if(watermarkProblem(defaults.watermark))invalid=true;
  return {defaults,...(invalid?{issue:'invalid' as const}:{})};
}

/** One vault/plugin instance owns the queue, including writes outliving a closed dialog. */
export class PreferenceStore {
  private state:PreferenceState={defaults:null};
  private pending:Promise<void>=Promise.resolve();
  constructor(private loadData:()=>Promise<unknown>,private saveData:(data:PluginData)=>Promise<void>) {}
  async load():Promise<void> {
    try {this.state=readPreferences(await this.loadData());}
    catch {this.state={defaults:null,issue:'load'};}
  }
  async read():Promise<PreferenceState> {
    await this.pending;
    return this.copy();
  }
  save(value:ExportPreferences|null):Promise<PreferenceState> {
    const snapshot=value===null?null:exportPreferences(value);
    const operation=this.pending.then(async()=>{
      if(snapshot&&watermarkProblem(snapshot.watermark))throw Error('Invalid watermark preferences.');
      await this.saveData({schemaVersion:1,exportDefaults:snapshot});
      this.state={defaults:snapshot};
      return this.copy();
    });
    this.pending=operation.then(()=>{},()=>{});
    return operation;
  }
  private copy():PreferenceState {
    return {...this.state,defaults:this.state.defaults?exportPreferences(this.state.defaults):null};
  }
}
