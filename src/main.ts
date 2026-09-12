import { FileSystemAdapter, Modal, Notice, Plugin, Setting, type App, type View } from 'obsidian';
import { snapshot } from './runtime';
import { exportCanvas, saveHTML } from './export';
import { strings, type Strings } from './i18n';
import { outputPath } from './canvas';
import { shell } from 'electron';

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

class ExportModal extends Modal {
  private controller=new AbortController();
  private running=false;
  private finished=false;
  constructor(app:App,private view:View,private closed:()=>void){super(app);}
  onOpen():void {
    const s=strings();this.modalEl.addClass('sce-export-modal');this.setTitle(s.title);
    let path='';
    try {path=snapshot(this.view).file.path.replace(/\.canvas$/i,'.html');}
    catch(error){this.contentEl.createEl('p',{text:String(error)});return;}
    let input:HTMLInputElement;
    new Setting(this.contentEl).setName(s.path).setDesc(s.pathHint).addText(t=>{t.setValue(path).onChange(v=>{path=v;});t.inputEl.addClass('sce-export-path');input=t.inputEl;});
    this.contentEl.createEl('p',{text:s.networkHint,cls:'sce-export-network-hint'});
    const status=this.contentEl.createDiv({cls:'sce-export-status',attr:{role:'status','aria-live':'polite'}});
    const progress=this.contentEl.createEl('progress',{cls:'sce-export-progress'});progress.hidden=true;
    const actions=this.contentEl.createDiv({cls:'sce-export-actions'});
    const cancel=actions.createEl('button',{text:s.cancel});cancel.addEventListener('click',()=>this.close());
    const run=actions.createEl('button',{text:s.export,cls:'mod-cta'});
    run.addEventListener('click',()=>{void this.run(path,s,status,progress,run,cancel,input!);});
  }
  private async run(path:string,s:Strings,status:HTMLElement,progress:HTMLProgressElement,run:HTMLButtonElement,cancel:HTMLButtonElement,input:HTMLInputElement):Promise<void> {
    if(this.running||this.finished)return;
    try {outputPath(path);}catch(error){status.textContent=String(error);return;}
    this.running=true;run.disabled=true;input.disabled=true;progress.hidden=false;status.textContent=s.working;
    try {
      const result=await exportCanvas(this.app,snapshot(this.view),s,this.controller.signal,(done,total)=>{progress.max=Math.max(1,total);progress.value=done;status.textContent=`${s.working} ${done}/${total}`;});
      status.textContent=s.saving;
      const saved=await saveHTML(this.app,path,result.html,this.controller.signal);
      this.finished=true;status.textContent=`${s.done}: ${saved}`;
      if(result.warnings.length)status.textContent+=`\n\n${s.warnings}:\n${result.warnings.map(w=>`• ${w}`).join('\n')}`;
      progress.hidden=true;cancel.textContent=s.close;run.hidden=true;
      const adapter=this.app.vault.adapter;
      if(adapter instanceof FileSystemAdapter){const button=run.parentElement!.createEl('button',{text:s.open});button.addEventListener('click',()=>{void shell.openPath(adapter.getFullPath(saved)).then(error=>{if(error)new Notice(error);}).catch(error=>new Notice(String(error)));});}
      new Notice(`${s.done}: ${saved}`);
    }catch(error){if(!this.controller.signal.aborted){status.textContent=`${s.failed}: ${error instanceof Error?error.message:String(error)}`;run.disabled=false;input.disabled=false;progress.hidden=true;}}
    finally{this.running=false;}
  }
  onClose():void {this.controller.abort();this.contentEl.empty();this.closed();}
}
