import { TFile, type App } from 'obsidian';

export class Assets {
  private cache=new Map<string,string>();
  private total=0;
  constructor(private app:App,private signal:AbortSignal,private warnings:Set<string>) {}
  async inline(root:HTMLElement,sourcePath:string):Promise<void> {
    for (const image of root.querySelectorAll<HTMLImageElement>('img')) {
      this.signal.throwIfAborted();
      const src=image.getAttribute('src')??'';
      if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(src)) {
        if(src.length>22*1024*1024 || this.total+src.length*.75>48*1024*1024) { this.unavailable(image,'Image is too large to embed.'); continue; }
        this.total+=src.length*.75; continue;
      }
      const embed=image.closest('.internal-embed');
      let link=embed?.getAttribute('src') ?? src;
      if (/^app:\/\//i.test(link)) {
        // Native resource URLs are matched against vault files, never decoded into arbitrary filesystem reads.
        const file=this.app.vault.getFiles().find(f=>this.app.vault.getResourcePath(f).split('?')[0]===link.split('?')[0]);
        link=file?.path??'';
      }
      if (/^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith('//') || !link) { this.unavailable(image,'Online or unsupported image.'); continue; }
      try { link=decodeURIComponent(link); } catch { /* literal filenames may contain percent characters */ }
      link=link.replace(/[?#].*$/,'').replace(/\|.*$/,'');
      const file=this.app.metadataCache.getFirstLinkpathDest(link,sourcePath) ?? this.app.vault.getAbstractFileByPath(link);
      if (!(file instanceof TFile) || !/^(png|jpe?g|webp|gif)$/i.test(file.extension)) { this.unavailable(image,`Image unavailable: ${link}`); continue; }
      try {
        let data=this.cache.get(file.path);
        if (!data) {
          if(file.stat.size>16*1024*1024 || this.total+file.stat.size>48*1024*1024) throw Error('Image size limit exceeded.');
          const buffer=await this.app.vault.readBinary(file);this.signal.throwIfAborted();
          const bytes=new Uint8Array(buffer);
          if(bytes.length>16*1024*1024 || this.total+bytes.length>48*1024*1024) throw Error('Image size limit exceeded.');
          let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
          const mime=/^jpe?g$/i.test(file.extension)?'jpeg':file.extension.toLowerCase();
          data=`data:image/${mime};base64,${btoa(binary)}`;this.total+=bytes.length;this.cache.set(file.path,data);
        }
        image.src=data;image.removeAttribute('srcset');image.loading='eager';
      } catch(error) { this.signal.throwIfAborted();this.unavailable(image,`${file.name}: ${String(error)}`); }
    }
    for (const embed of root.querySelectorAll<HTMLElement>('.internal-embed')) {
      if(embed.querySelector('img'))continue;
      const label=embed.getAttribute('src')??'Embedded content';
      embed.textContent=`[${label}]`;embed.classList.add('sce-resource-placeholder');this.warnings.add(`Embedded content is not supported: ${label}`);
    }
  }
  private unavailable(image:HTMLImageElement,message:string):void { const text=image.ownerDocument.defaultView!.createSpan({text:`[${image.alt||message}]`,cls:'sce-resource-placeholder'});image.replaceWith(text);this.warnings.add(message); }
}
