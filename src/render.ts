import { Component, MarkdownRenderer, parseLinktext, type App } from 'obsidian';
import { type CanvasNode, escapeHTML } from './canvas';
import { matchingNode, type Snapshot } from './runtime';
import { StyleBank, computed, freezeTree, spacer, ensureBadges, resolveColor } from './styles';
import { Assets } from './assets';
import { asError, withTimeout } from './async';

export interface RenderedCard { node:CanvasNode; html:string; frameClass:string; scrollHeight:number; clientHeight:number }
export class Renderer {
  readonly stage:HTMLElement;
  private readonly component=new Component();
  private readonly assets:Assets;
  constructor(private app:App,private snap:Snapshot,readonly bank:StyleBank,private signal:AbortSignal,private warnings:Set<string>) {
    const doc=snap.document;
    this.stage=doc.defaultView!.createDiv({cls:'canvas sce-staging'});
    this.stage.setAttribute('aria-hidden','true');this.stage.inert=true;
    (snap.native?.wrapperEl??doc.body).appendChild(this.stage);
    this.component.load();this.assets=new Assets(app,signal,warnings);
  }
  async card(n:CanvasNode,index:number):Promise<RenderedCard> {
    this.signal.throwIfAborted();
    const doc=this.snap.document, source=matchingNode(this.snap.native,n);
    const host=(source?.cloneNode(false)??doc.defaultView!.createDiv()) as HTMLElement;
    host.classList.add('canvas-node','sce-render-node');host.classList.remove('is-selected','is-focused','is-editing','is-dragging');
    if(n.color){const color=resolveColor(n.color,this.stage);if(color){host.classList.add('is-themed');host.style.setProperty('--canvas-color',color);}}
    // Remove layout values copied from the live node before applying the staging layout.
    for(const property of ['position','transform','width','height'])host.style.removeProperty(property);
    host.setCssProps({'--canvas-node-width':`${n.width}px`,'--canvas-node-height':`${n.height}px`});
    const frame=host.createDiv({cls:'canvas-node-container'});
    const content=frame.createDiv({cls:'canvas-node-content markdown-embed'});
    const embed=content.createDiv({cls:'markdown-embed-content'});
    const preview=embed.createDiv({cls:'markdown-preview-view markdown-rendered'});
    const sizer=preview.createDiv({cls:'markdown-preview-sizer markdown-preview-section sce-render-sizer'});
    this.stage.appendChild(host);
    try {
      if(n.type!=='text') {
        this.warnings.add(`Card ${n.id}: ${n.type} cards are not supported yet.`);
        sizer.textContent=`[${n.type}] ${n.label??n.file??n.url??n.id}`;
      } else {
        await withTimeout(MarkdownRenderer.render(this.app,n.text??'',sizer,this.snap.file.path,this.component),12000,this.signal,doc.win);
        // Canvas's preview wraps each Markdown block; the public renderer emits bare blocks.
        for(const child of Array.from(sizer.children)){
          if(Array.from(child.classList).some(c=>c.startsWith('el-')))continue;
          const block=doc.defaultView!.createDiv({cls:`el-${child.tagName.toLowerCase()}`});child.before(block);block.appendChild(child);
        }
        // Obsidian resets the first block's top margin using this sibling selector.
        const pusher=doc.defaultView!.createDiv({cls:'markdown-preview-pusher sce-render-pusher'});sizer.prepend(pusher);
        for(const link of sizer.querySelectorAll<HTMLElement>('a.internal-link')){
          const path=parseLinktext(link.getAttribute('data-href')??link.getAttribute('href')??'').path;
          link.classList.toggle('is-unresolved',!!path&&!this.app.metadataCache.getFirstLinkpathDest(path,this.snap.file.path));
        }
        if(ensureBadges(sizer))this.warnings.add('SimpleBadge used its built-in fallback style.');
        await this.assets.inline(sizer,this.snap.file.path);
        await this.waitForContent(sizer);
      }
      const frozen=freezeTree(sizer,this.bank,`sce-n${index}`);
      const scrollStyle:Record<string,string>={'scrollbar-gutter':computed(preview).scrollbarGutter};
      const tint=computed(content).backgroundColor;
      if(tint!=='rgba(0, 0, 0, 0)'&&tint!=='transparent')scrollStyle['background-color']=tint;
      const scrollClass=this.bank.capture(preview,scrollStyle);
      const before=spacer(preview,this.bank,'::before'), after=spacer(preview,this.bank,'::after');
      const frameClass=this.bank.capture(frame);
      const html=`<div class="sce-card-scroll ${scrollClass}" tabindex="0" role="region" aria-label="${escapeHTML((n.text??n.label??n.type).replace(/<[^>]*>/g,'').slice(0,100))}">${before}${frozen.outerHTML}${after}</div>`;
      return {node:n,html,frameClass,scrollHeight:preview.scrollHeight,clientHeight:preview.clientHeight};
    } finally {host.remove();}
  }
  private async waitForContent(root:HTMLElement):Promise<void> {
    const doc=root.ownerDocument,win=doc.defaultView!;
    try { await withTimeout(doc.fonts.ready,4000,this.signal,win); }
    catch { this.signal.throwIfAborted();this.warnings.add('Fonts did not finish loading before export.'); }
    for(const image of root.querySelectorAll('img')) {
      try {await withTimeout(image.decode(),5000,this.signal,win);} catch {this.signal.throwIfAborted();this.warnings.add(`Image could not be decoded: ${image.alt||'image'}`);}
    }
    await new Promise<void>((resolve,reject)=>{
      let timer:number,limit:number;
      const cleanup=()=>{win.clearTimeout(timer);win.clearTimeout(limit);observer.disconnect();this.signal.removeEventListener('abort',abort);};
      const finish=()=>{cleanup();resolve();};
      const abort=()=>{cleanup();reject(asError(this.signal.reason));};
      const observer=new win.MutationObserver(()=>{win.clearTimeout(timer);timer=win.setTimeout(finish,100);});
      observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true});
      timer=win.setTimeout(finish,100);limit=win.setTimeout(()=>{this.warnings.add('Some dynamic content did not settle before export.');finish();},1500);
      this.signal.addEventListener('abort',abort,{once:true});
      if(this.signal.aborted)abort();
    });
    this.signal.throwIfAborted();
  }
  dispose():void {this.component.unload();this.stage.remove();}
}
