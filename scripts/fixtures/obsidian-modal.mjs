// Minimal UI/lifecycle adapter for exercising the real ExportModal in a browser.
// Not a substitute for testing Obsidian's own controls or Markdown renderer.
function create(tag,options={}){
  const el=document.createElement(tag);
  if(options.cls)el.className=options.cls;if(options.text)el.textContent=options.text;
  for(const [key,value] of Object.entries(options.attr??{}))el.setAttribute(key,value);
  return el;
}
window.createDiv=options=>create('div',options);
HTMLElement.prototype.createEl=function(tag,options){const el=create(tag,options);this.appendChild(el);return el;};
HTMLElement.prototype.createDiv=function(options){return this.createEl('div',options);};
HTMLElement.prototype.addClass=function(...classes){this.classList.add(...classes);};
HTMLElement.prototype.empty=function(){this.replaceChildren();};
export const getLanguage=()=>window.testLanguage??'zh';
export class Component{load(){}unload(){}}
export class Plugin{}
export class FileSystemAdapter{}
export class TFile{}
export class TextFileView{}
export class Notice{}
export const MarkdownRenderer={};
export const parseLinktext=path=>({path});
export class Modal{
  constructor(app){this.app=app;this.modalEl=create('div',{cls:'modal'});this.heading=this.modalEl.createEl('h2');this.contentEl=this.modalEl.createDiv({cls:'modal-content'});}
  setTitle(title){this.heading.textContent=title;}
  open(){document.body.appendChild(this.modalEl);this.onOpen();}
  close(){this.onClose();this.modalEl.remove();}
}
class Text{
  constructor(container){this.inputEl=container.createEl('input',{attr:{type:'text'}});}
  setValue(value){this.inputEl.value=value;return this;}
  setPlaceholder(value){this.inputEl.placeholder=value;return this;}
  setDisabled(disabled){this.inputEl.disabled=disabled;return this;}
  onChange(callback){this.inputEl.addEventListener('input',()=>callback(this.inputEl.value));return this;}
}
class Toggle{
  constructor(container){this.toggleEl=container.createEl('button',{attr:{type:'button',role:'switch'}});this.toggleEl.addEventListener('click',()=>{this.setValue(!this.value);this.callback?.(this.value);});}
  setValue(value){this.value=value;this.toggleEl.setAttribute('aria-checked',String(value));this.toggleEl.textContent=value?'✓':'○';return this;}
  setDisabled(disabled){this.toggleEl.disabled=disabled;return this;}
  onChange(callback){this.callback=callback;return this;}
}
export class Setting{
  constructor(container){this.settingEl=container.createDiv({cls:'setting-item'});const info=this.settingEl.createDiv({cls:'setting-item-info'});this.name=info.createDiv({cls:'setting-item-name'});this.desc=info.createDiv({cls:'setting-item-description'});this.control=this.settingEl.createDiv({cls:'setting-item-control'});this.controlEl=this.control;}
  setName(value){this.name.textContent=value;return this;}
  setDesc(value){this.desc.textContent=value;return this;}
  setClass(value){this.settingEl.classList.add(value);return this;}
  addText(callback){callback(new Text(this.control));return this;}
  addToggle(callback){callback(new Toggle(this.control));return this;}
  addSlider(callback){callback(new Slider(this.control));return this;}
}
class Slider{
  constructor(container){this.sliderEl=container.createEl('input',{attr:{type:'range'}});}
  setLimits(min,max,step){Object.assign(this.sliderEl,{min,max,step});return this;}
  setValue(value){this.sliderEl.value=value;return this;}
  setDisabled(disabled){this.sliderEl.disabled=disabled;return this;}
  onChange(callback){this.sliderEl.addEventListener('input',()=>callback(Number(this.sliderEl.value)));return this;}
}
