import { FileSystemAdapter, Modal, Notice, Plugin, Setting, type App, type View } from 'obsidian';
import { snapshot } from './runtime';
import { exportCanvas, saveHTML } from './export';
import { strings, type Strings } from './i18n';
import { outputPath } from './canvas';
import { shell } from 'electron';
import { type ExportOptions } from './metadata';
import { createWatermark, normalizeWatermark, watermarkProblem } from './watermark';

declare const __QA__:boolean;
export default class SimpleCanvasExporter extends Plugin {
  private modal:ExportModal|undefined;
  onload():void {
    this.addCommand({id:'export-html',name:strings().command,checkCallback:checking=>{
      const view=this.app.workspace.getMostRecentLeaf()?.view;
      if(!view||view.getViewType()!=='canvas')return false;
      if(!checking){this.modal?.close();this.modal=new ExportModal(this.app,view,()=>{this.modal=undefined;});this.modal.open();}return true;
    }});
    if(__QA__)void import('../tests/obsidian-qa').then(({runQA})=>runQA(this.app));
  }
  onunload():void {this.modal?.close();}
}

export class ExportModal extends Modal {
  private controller=new AbortController();
  private running=false;
  private finished=false;
  constructor(app:App,private view:View,private closed:()=>void){super(app);}
  onOpen():void {
    const s=strings();this.modalEl.addClass('sce-export-modal');this.setTitle(s.title);
    let path='',title='';
    try {const file=snapshot(this.view).file;path=file.path.replace(/\.canvas$/i,'.html');title=file.basename;}
    catch(error){this.contentEl.createEl('p',{text:String(error)});return;}
    const options:ExportOptions={title,author:'',showAuthor:false,showTime:false};
    const refreshFields:(()=>void)[]=[];
    const disabled=()=>this.running||this.finished;
    const updateFields=()=>{for(const refresh of refreshFields)refresh();};
    new Setting(this.contentEl).setName(s.path).setDesc(s.pathHint).addText(t=>{t.setValue(path).onChange(v=>{path=v;});t.inputEl.addClass('sce-export-path');t.inputEl.setAttribute('aria-label',s.path);refreshFields.push(()=>{t.setDisabled(disabled());});});
    new Setting(this.contentEl).setName(s.exportTitle).setDesc(s.exportTitleHint).addText(t=>{t.setValue(title).setPlaceholder(title).onChange(v=>{options.title=v;});t.inputEl.addClass('sce-export-title');t.inputEl.setAttribute('aria-label',s.exportTitle);refreshFields.push(()=>{t.setDisabled(disabled());});});
    new Setting(this.contentEl).setName(s.showAuthor).setDesc(s.authorHint).setClass('sce-export-author-setting')
      .addToggle(t=>{t.setValue(false).onChange(v=>{options.showAuthor=v;updateFields();});t.toggleEl.setAttribute('aria-label',s.showAuthor);refreshFields.push(()=>{t.setDisabled(disabled());});})
      .addText(t=>{t.setPlaceholder(s.authorPlaceholder).onChange(v=>{options.author=v;});t.inputEl.addClass('sce-export-author');t.inputEl.setAttribute('aria-label',s.author);refreshFields.push(()=>{t.setDisabled(disabled()||!options.showAuthor);});});
    new Setting(this.contentEl).setName(s.showTime).setDesc(s.exportTimeHint).addToggle(t=>{t.setValue(false).onChange(v=>{options.showTime=v;});t.toggleEl.setAttribute('aria-label',s.showTime);refreshFields.push(()=>{t.setDisabled(disabled());});});
    const watermark={enabled:false,text:'',opacity:8};options.watermark=watermark;
    new Setting(this.contentEl).setName(s.watermark).setDesc(s.watermarkHint).addToggle(t=>{
      t.setValue(false).onChange(v=>{watermark.enabled=v;showWatermarkError(false);updateFields();});
      t.toggleEl.setAttribute('aria-label',s.watermark);refreshFields.push(()=>{t.setDisabled(disabled());});
    });
    const watermarkFields=this.contentEl.createDiv({cls:'sce-watermark-fields'});
    let watermarkInput:HTMLInputElement;
    new Setting(watermarkFields).setName(s.watermarkText).addText(t=>{
      watermarkInput=t.inputEl;t.inputEl.addClass('sce-watermark-text');t.inputEl.setAttribute('aria-label',s.watermarkText);
      t.inputEl.setAttribute('aria-describedby','sce-watermark-error');t.inputEl.setAttribute('aria-invalid','false');
      t.setPlaceholder(s.watermarkPlaceholder).onChange(v=>{watermark.text=v;showWatermarkError(!watermarkError.hidden);renderPreview();});
      refreshFields.push(()=>{t.setDisabled(disabled()||!watermark.enabled);});
    });
    const watermarkError=watermarkFields.createEl('p',{cls:'sce-watermark-error',attr:{id:'sce-watermark-error',role:'alert'}});watermarkError.hidden=true;
    const opacitySetting=new Setting(watermarkFields).setName(s.watermarkOpacity);
    const opacityValue=opacitySetting.controlEl.createEl('output',{text:'8%',cls:'sce-watermark-opacity-value'});
    opacitySetting.addSlider(slider=>{
      slider.setLimits(4,16,1).setValue(8).onChange(v=>{watermark.opacity=v;opacityValue.textContent=`${v}%`;slider.sliderEl.setAttribute('aria-valuetext',`${v}%`);renderPreview();});
      slider.sliderEl.setAttribute('aria-label',s.watermarkOpacity);slider.sliderEl.setAttribute('aria-valuetext','8%');
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
    updateFields();
    this.contentEl.createEl('p',{text:s.networkHint,cls:'sce-export-network-hint'});
    const status=this.contentEl.createDiv({cls:'sce-export-status',attr:{role:'status','aria-live':'polite'}});
    const progress=this.contentEl.createEl('progress',{cls:'sce-export-progress'});progress.hidden=true;
    const actions=this.contentEl.createDiv({cls:'sce-export-actions'});
    const cancel=actions.createEl('button',{text:s.cancel});cancel.addEventListener('click',()=>this.close());
    const run=actions.createEl('button',{text:s.export,cls:'mod-cta'});
    run.addEventListener('click',()=>{
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
