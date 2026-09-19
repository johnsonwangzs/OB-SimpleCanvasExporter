import { FileSystemAdapter, Modal, Notice, Plugin, Setting, type App, type View } from 'obsidian';
import { snapshot } from './runtime';
import { exportCanvas, saveHTML } from './export';
import { strings, type Strings } from './i18n';
import { outputPath } from './canvas';
import { shell } from 'electron';
import { type ExportOptions } from './metadata';
import { createWatermark, normalizeWatermark, watermarkProblem } from './watermark';
import { exportPreferences, PreferenceStore, type PreferenceActions } from './preferences';

declare const __QA__:boolean;
export default class SimpleCanvasExporter extends Plugin {
  private modal:ExportModal|undefined;
  private preferences=new PreferenceStore(async()=>{const data:unknown=await this.loadData();return data;},data=>this.saveData(data));
  private openRequest=0;
  private unloaded=false;
  async onload():Promise<void> {
    await this.preferences.load();
    if(this.unloaded)return;
    this.addCommand({id:'export-html',name:strings().command,checkCallback:checking=>{
      const view=this.app.workspace.getMostRecentLeaf()?.view;
      if(!view||view.getViewType()!=='canvas')return false;
      if(!checking)void this.openExport(view);return true;
    }});
    if(__QA__)void import('../tests/obsidian-qa').then(({runQA})=>runQA(this.app));
  }
  private async openExport(view:View):Promise<void> {
    const request=++this.openRequest;
    this.modal?.close();
    const initial=await this.preferences.read();
    if(this.unloaded||request!==this.openRequest)return;
    const modal=new ExportModal(this.app,view,()=>{if(this.modal===modal)this.modal=undefined;},
      {initial,save:value=>this.preferences.save(value)});
    this.modal=modal;modal.open();
  }
  onunload():void {this.unloaded=true;this.openRequest++;this.modal?.close();}
}

export class ExportModal extends Modal {
  private controller=new AbortController();
  private running=false;
  private finished=false;
  private savingPreferences=false;
  constructor(app:App,private view:View,private closed:()=>void,private preferences:PreferenceActions){super(app);}
  onOpen():void {
    const s=strings();this.modalEl.addClass('sce-export-modal');this.setTitle(s.title);
    let path='',title='';
    try {const file=snapshot(this.view).file;path=file.path.replace(/\.canvas$/i,'.html');title=file.basename;}
    catch(error){this.contentEl.createEl('p',{text:String(error)});return;}
    let savedPreferences=this.preferences.initial;
    const options={title,...exportPreferences(savedPreferences.defaults??{})};
    const refreshFields:(()=>void)[]=[];
    const disabled=()=>this.running||this.finished||this.savingPreferences;
    const updateFields=()=>{for(const refresh of refreshFields)refresh();};
    let preferencesChanged=()=>{};
    new Setting(this.contentEl).setName(s.path).setDesc(s.pathHint).addText(t=>{t.setValue(path).onChange(v=>{path=v;});t.inputEl.addClass('sce-export-path');t.inputEl.setAttribute('aria-label',s.path);refreshFields.push(()=>{t.setDisabled(disabled());});});
    new Setting(this.contentEl).setName(s.exportTitle).setDesc(s.exportTitleHint).addText(t=>{t.setValue(title).setPlaceholder(title).onChange(v=>{options.title=v;});t.inputEl.addClass('sce-export-title');t.inputEl.setAttribute('aria-label',s.exportTitle);refreshFields.push(()=>{t.setDisabled(disabled());});});
    new Setting(this.contentEl).setName(s.showAuthor).setDesc(s.authorHint).setClass('sce-export-author-setting')
      .addToggle(t=>{t.setValue(options.showAuthor).onChange(v=>{options.showAuthor=v;preferencesChanged();updateFields();});t.toggleEl.setAttribute('aria-label',s.showAuthor);refreshFields.push(()=>{t.setDisabled(disabled());});})
      .addText(t=>{t.setValue(options.author).setPlaceholder(s.authorPlaceholder).onChange(v=>{options.author=v;preferencesChanged();});t.inputEl.addClass('sce-export-author');t.inputEl.setAttribute('aria-label',s.author);refreshFields.push(()=>{t.setDisabled(disabled()||!options.showAuthor);});});
    new Setting(this.contentEl).setName(s.showTime).setDesc(s.exportTimeHint).addToggle(t=>{t.setValue(options.showTime).onChange(v=>{options.showTime=v;preferencesChanged();});t.toggleEl.setAttribute('aria-label',s.showTime);refreshFields.push(()=>{t.setDisabled(disabled());});});
    const watermark=options.watermark;
    new Setting(this.contentEl).setName(s.watermark).setDesc(s.watermarkHint).addToggle(t=>{
      t.setValue(watermark.enabled).onChange(v=>{watermark.enabled=v;showWatermarkError(v);preferencesChanged();updateFields();});
      t.toggleEl.setAttribute('aria-label',s.watermark);refreshFields.push(()=>{t.setDisabled(disabled());});
    });
    const watermarkFields=this.contentEl.createDiv({cls:'sce-watermark-fields'});
    let watermarkInput:HTMLInputElement;
    new Setting(watermarkFields).setName(s.watermarkText).addText(t=>{
      watermarkInput=t.inputEl;t.inputEl.addClass('sce-watermark-text');t.inputEl.setAttribute('aria-label',s.watermarkText);
      t.inputEl.setAttribute('aria-describedby','sce-watermark-error');t.inputEl.setAttribute('aria-invalid','false');
      t.setValue(watermark.text).setPlaceholder(s.watermarkPlaceholder).onChange(v=>{watermark.text=v;showWatermarkError(!watermarkError.hidden);renderPreview();preferencesChanged();});
      refreshFields.push(()=>{t.setDisabled(disabled()||!watermark.enabled);});
    });
    const watermarkError=watermarkFields.createEl('p',{cls:'sce-watermark-error',attr:{id:'sce-watermark-error',role:'alert'}});watermarkError.hidden=true;
    const opacitySetting=new Setting(watermarkFields).setName(s.watermarkOpacity);
    const opacityValue=opacitySetting.controlEl.createEl('output',{text:`${watermark.opacity}%`,cls:'sce-watermark-opacity-value'});
    opacitySetting.addSlider(slider=>{
      slider.setLimits(4,16,1).setValue(watermark.opacity).onChange(v=>{watermark.opacity=v;opacityValue.textContent=`${v}%`;slider.sliderEl.setAttribute('aria-valuetext',`${v}%`);renderPreview();preferencesChanged();});
      slider.sliderEl.setAttribute('aria-label',s.watermarkOpacity);slider.sliderEl.setAttribute('aria-valuetext',`${watermark.opacity}%`);
      refreshFields.push(()=>{slider.setDisabled(disabled()||!watermark.enabled);});
    });
    watermarkFields.createEl('p',{text:s.watermarkStyle,cls:'sce-watermark-preview-label'});
    const preview=watermarkFields.createDiv({cls:'sce-watermark-preview',attr:{role:'img','aria-label':s.watermarkPreview}});
    preview.createDiv({cls:'sce-watermark-preview-card',text:s.watermarkCard});
    function showWatermarkError(report:boolean):boolean {
      const problem=watermarkProblem(watermark);
      watermarkError.hidden=!report||!problem;watermarkError.textContent=problem==='long'?s.watermarkLong:s.watermarkEmpty;
      watermarkInput.setAttribute('aria-invalid',String(report&&!!problem));return !problem;
    }
    function renderPreview():void {
      preview.querySelector('svg')?.remove();
      const normalized=normalizeWatermark(watermark);
      if(normalized){const doc=preview.ownerDocument;preview.appendChild(createWatermark(doc,normalized,doc.defaultView!.getComputedStyle(preview).backgroundColor,'sce-watermark-preview-pattern'));}
    }
    refreshFields.push(()=>{watermarkFields.hidden=!watermark.enabled;renderPreview();});
    showWatermarkError(watermark.enabled);
    const preferenceArea=this.contentEl.createDiv({cls:'sce-preferences'});
    new Setting(preferenceArea).setName(s.preferences).setDesc(s.preferencesHint);
    const preferenceButtons=preferenceArea.createDiv({cls:'sce-preference-actions'});
    const saveDefaults=preferenceButtons.createEl('button',{text:s.preferencesSave,attr:{type:'button'}});
    const clearDefaults=preferenceButtons.createEl('button',{text:s.preferencesClear,attr:{type:'button',title:s.preferencesClearHint}});
    const preferenceStatus=preferenceArea.createEl('p',{cls:'sce-preference-status',attr:{role:'status','aria-live':'polite'}});
    const reportPreference=(text:string,error=false)=>{
      preferenceStatus.textContent=text;preferenceStatus.classList.toggle('sce-preference-error',error);
    };
    const matchesDefaults=()=>savedPreferences.defaults!==null&&JSON.stringify(exportPreferences(options))===JSON.stringify(savedPreferences.defaults);
    const updatePreferenceButtons=()=>{
      saveDefaults.disabled=disabled()||(!savedPreferences.issue&&matchesDefaults());
      clearDefaults.disabled=disabled()||(!savedPreferences.defaults&&!savedPreferences.issue);
    };
    refreshFields.push(updatePreferenceButtons);
    preferencesChanged=()=>{
      if(disabled())return;
      reportPreference(matchesDefaults()?s.preferencesLoaded:s.preferencesChanged);updatePreferenceButtons();
    };
    reportPreference(savedPreferences.issue==='load'?s.preferencesLoadFailed:savedPreferences.issue==='invalid'?s.preferencesInvalid:savedPreferences.defaults?s.preferencesLoaded:s.preferencesEmpty,!!savedPreferences.issue);
    const persist=async(clear:boolean)=>{
      if(disabled())return;
      if(!clear&&!showWatermarkError(true)){watermarkInput.focus();return;}
      const value=clear?null:exportPreferences(options);
      this.savingPreferences=true;reportPreference(clear?s.preferencesClearing:s.preferencesSaving);updateFields();
      try {
        const next=await this.preferences.save(value);
        if(this.controller.signal.aborted)return;
        savedPreferences=next;reportPreference(clear?s.preferencesCleared:s.preferencesSaved);
      } catch {
        const message=clear?s.preferencesClearFailed:s.preferencesSaveFailed;
        if(this.controller.signal.aborted)new Notice(message);else reportPreference(message,true);
      } finally {
        this.savingPreferences=false;
        if(!this.controller.signal.aborted)updateFields();
      }
    };
    saveDefaults.addEventListener('click',()=>{void persist(false);});
    clearDefaults.addEventListener('click',()=>{void persist(true);});
    updateFields();
    this.contentEl.createEl('p',{text:s.networkHint,cls:'sce-export-network-hint'});
    const status=this.contentEl.createDiv({cls:'sce-export-status',attr:{role:'status','aria-live':'polite'}});
    const progress=this.contentEl.createEl('progress',{cls:'sce-export-progress'});progress.hidden=true;
    const actions=this.contentEl.createDiv({cls:'sce-export-actions'});
    const cancel=actions.createEl('button',{text:s.cancel});cancel.addEventListener('click',()=>this.close());
    const run=actions.createEl('button',{text:s.export,cls:'mod-cta'});
    refreshFields.push(()=>{run.disabled=disabled();});
    run.addEventListener('click',()=>{
      if(disabled())return;
      if(!showWatermarkError(true)){watermarkInput.focus();return;}
      void this.run(path,{...options,watermark:{...watermark}},s,status,progress,run,cancel,updateFields);
    });
  }
  private async run(path:string,options:ExportOptions,s:Strings,status:HTMLElement,progress:HTMLProgressElement,run:HTMLButtonElement,cancel:HTMLButtonElement,updateFields:()=>void):Promise<void> {
    if(this.running||this.finished)return;
    try {outputPath(path);}catch(error){status.textContent=String(error);return;}
    this.running=true;run.disabled=true;updateFields();progress.hidden=false;status.textContent=s.working;
    try {
      const result=await exportCanvas(this.app,snapshot(this.view),s,this.controller.signal,(done,total)=>{progress.max=Math.max(1,total);progress.value=done;status.textContent=`${s.working} ${done}/${total}`;},options);
      status.textContent=s.saving;
      const saved=await saveHTML(this.app,path,result.html,this.controller.signal);
      this.finished=true;status.textContent=`${s.done}: ${saved}`;
      if(result.warnings.length)status.textContent+=`\n\n${s.warnings}:\n${result.warnings.map(w=>`• ${w}`).join('\n')}`;
      progress.hidden=true;cancel.textContent=s.close;run.hidden=true;
      const adapter=this.app.vault.adapter;
      if(adapter instanceof FileSystemAdapter){const button=run.parentElement!.createEl('button',{text:s.open});button.addEventListener('click',()=>{void shell.openPath(adapter.getFullPath(saved)).then(error=>{if(error)new Notice(error);}).catch(error=>new Notice(String(error)));});}
      new Notice(`${s.done}: ${saved}`);
    }catch(error){if(!this.controller.signal.aborted){status.textContent=`${s.failed}: ${error instanceof Error?error.message:String(error)}`;run.disabled=false;progress.hidden=true;}}
    finally{this.running=false;if(!this.controller.signal.aborted)updateFields();}
  }
  onClose():void {this.controller.abort();this.contentEl.empty();this.closed();}
}
