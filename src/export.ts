import { type App } from 'obsidian';
import { escapeHTML as esc, fallbackGeometry, sceneBounds, outputPath, type CanvasEdge, type EdgeGeometry, type Bounds } from './canvas';
import { matchingPath, type Snapshot, type NativePath } from './runtime';
import { computed, freezeTree, StyleBank, viewerCSS, resolveColor } from './styles';
import { Renderer, type RenderedCard } from './render';
import { startViewer } from './viewer';
import { viewerToolbar } from './viewer-html';
import { type Strings } from './i18n';
import { exportMetadata, type ExportOptions } from './metadata';

export interface ExportResult { html:string; warnings:string[]; cards:number; connections:number; nativePaths:number; elapsedMs:number; metrics:{id:string;scrollHeight:number;clientHeight:number}[] }
interface EdgeRecord { edge:CanvasEdge; geometry:EdgeGeometry; nativeHTML:string|undefined; bounds:Bounds }
export async function exportCanvas(app:App,snap:Snapshot,s:Strings,signal:AbortSignal,progress:(done:number,total:number)=>void=()=>{},options:ExportOptions={}):Promise<ExportResult> {
  const started=performance.now(),warnings=new Set(snap.data.warnings),bank=new StyleBank();
  signal.throwIfAborted();
  const metadata=exportMetadata(snap.file.basename,options);
  const renderer=new Renderer(app,snap,bank,signal,warnings);
  try {
    const nodes=new Map(snap.data.nodes.map(n=>[n.id,n]));
    // Freeze geometry and computed styles while the SVG still has its live ancestors.
    // Themes such as Prism scope edge paint to parent groups and inherited variables.
    const records:EdgeRecord[]=snap.data.edges.map((edge,index)=>{
      const a=nodes.get(edge.fromNode)!,b=nodes.get(edge.toNode)!,geometry=fallbackGeometry(edge,a,b);
      const candidate=matchingPath(snap.native,edge,a,b);
      const nativeHTML=candidate?freezeNativeEdge(candidate,index,renderer,bank,snap):undefined;
      return {edge,geometry,nativeHTML,bounds:candidate?.bounds??geometry.bounds};
    });
    const nativePaths=records.filter(r=>r.nativeHTML!==undefined).length;
    if(nativePaths<records.length)warnings.add(`${records.length-nativePaths} connection(s) used the compatible curve renderer.`);
    const cards:RenderedCard[]=[];
    let done=0;progress(0,snap.data.nodes.length);
    for(let batch=0;batch<snap.data.nodes.length;batch+=4){
      const rendered=await Promise.all(snap.data.nodes.slice(batch,batch+4).map(async(n,offset)=>{
        signal.throwIfAborted();
        try{return await renderer.card(n,batch+offset);}
        catch(error){signal.throwIfAborted();warnings.add(`Card ${n.id}: ${String(error)}`);return {node:n,html:`<div class="sce-card-scroll sce-placeholder">${esc(n.text??n.label??n.file??n.type)}</div>`,frameClass:'',scrollHeight:0,clientHeight:0};}
        finally{progress(++done,snap.data.nodes.length);}
      }));cards.push(...rendered);
    }
    progress(cards.length,cards.length);signal.throwIfAborted();
    const edgeHTML=records.map(r=>renderEdge(r,renderer,bank,snap.document));
    const edgeBounds=records.map(r=>r.edge.label?{minX:Math.min(r.bounds.minX,r.geometry.center.x-150),maxX:Math.max(r.bounds.maxX,r.geometry.center.x+150),minY:Math.min(r.bounds.minY,r.geometry.center.y-100),maxY:Math.max(r.bounds.maxY,r.geometry.center.y+100)}:r.bounds);
    const b=sceneBounds(snap.data.nodes,edgeBounds),padding=40,dx=-b.minX+padding,dy=-b.minY+padding,width=b.maxX-b.minX+2*padding,height=b.maxY-b.minY+2*padding;
    const bodyClass=bank.add(theme(snap));
    const nodeHTML=cards.map((c,i)=>`<article class="sce-card ${c.frameClass}" data-node-id="${esc(c.node.id)}" data-node-type="${esc(c.node.type)}" style="left:${c.node.x+dx}px;top:${c.node.y+dy}px;width:${c.node.width}px;height:${c.node.height}px;z-index:${i+2}">${c.html}</article>`).join('\n');
    const labels=records.filter(r=>r.edge.label).map(r=>`<div class="sce-edge-label" data-edge-label="${esc(r.edge.id)}" data-from-node="${esc(r.edge.fromNode)}" data-to-node="${esc(r.edge.toNode)}" style="left:${r.geometry.center.x+dx}px;top:${r.geometry.center.y+dy}px;z-index:${cards.length+3}">${esc(r.edge.label!)}</div>`).join('');
    const title=metadata.title;
    const html=`<!doctype html>
<html lang="${s.export==='导出'?'zh-CN':'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'">
<meta name="generator" content="Simple Canvas Exporter 1.0.0"><title>${esc(title)}</title>
<style>${viewerCSS}\n${bank.css()}</style></head><body class="${bodyClass}" data-sce-export-id="${snap.document.defaultView!.crypto.randomUUID()}">
${viewerToolbar(s,title,cards.length,records.length,metadata)}
<main class="sce-viewport" tabindex="0" aria-label="${esc(title)}"><div class="sce-scene" data-width="${width}" data-height="${height}" data-origin-x="${dx}" data-origin-y="${dy}" style="width:${width}px;height:${height}px">
<svg class="sce-edges" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" aria-hidden="true"><g transform="translate(${dx} ${dy})">${edgeHTML.join('\n')}</g></svg>
${nodeHTML}${labels}${cards.length?'':`<div class="sce-empty">${esc(s.empty)}</div>`}</div></main><div class="sce-help">${esc(s.help)}</div>
<script>(${startViewer.toString()})(${JSON.stringify(s.searchCurrent).replace(/</g,'\\u003c')});</script></body></html>`;
    return {html,warnings:[...warnings],cards:cards.length,connections:records.length,nativePaths,elapsedMs:Math.round(performance.now()-started),metrics:cards.map(c=>({id:c.node.id,scrollHeight:c.scrollHeight,clientHeight:c.clientHeight}))};
  } finally {renderer.dispose();}
}

function freezeNativeEdge(native:NativePath,index:number,renderer:Renderer,bank:StyleBank,snap:Snapshot):string {
  let line=native.line,ends=native.ends;
  let probe:SVGSVGElement|undefined;
  try {
    // Obsidian detaches some offscreen edges. Reattach copies of their complete
    // native groups so theme selectors and inherited color variables still apply.
    if(!line.isConnected||(ends&&!ends.isConnected)) {
      probe=snap.document.defaultView!.createSvg('svg',{cls:'canvas-edges'});renderer.stage.appendChild(probe);
      // Card staging uses zoom 1; edges retain the native zoom-dependent line width.
      if(snap.native?.canvasEl)probe.style.setProperty('--zoom-multiplier',computed(snap.native.canvasEl).getPropertyValue('--zoom-multiplier'));
      if(!line.isConnected){
        const group=native.group.cloneNode(true) as SVGElement;probe.appendChild(group);
        line=group.querySelector<SVGElement>('.canvas-display-path')!;
      }
      if(ends&&!ends.isConnected){ends=ends.cloneNode(true) as SVGElement;probe.appendChild(ends);}
    }
    return freezeTree(line,bank,`sce-e${index}`).outerHTML+(ends?freezeTree(ends,bank,`sce-a${index}`).outerHTML:'');
  } finally {probe?.remove();}
}

function renderEdge(r:EdgeRecord,renderer:Renderer,bank:StyleBank,doc:Document):string {
  if(r.nativeHTML!==undefined)return `<g data-edge-id="${esc(r.edge.id)}" data-from-node="${esc(r.edge.fromNode)}" data-to-node="${esc(r.edge.toNode)}" data-path-source="native">${r.nativeHTML}</g>`;
  const svg=doc.defaultView!.createSvg('svg',{cls:'canvas-edges'});renderer.stage.appendChild(svg);
  const edgeColor=resolveColor(r.edge.color,renderer.stage);if(edgeColor)svg.style.setProperty('--canvas-color',edgeColor);
  try {
    const sample=svg.createSvg('g').createSvg('path',{cls:'canvas-display-path'});
    const color=resolveColor(r.edge.color,renderer.stage)||computed(sample).stroke||'#7e7e7e';
    const lineClass=bank.capture(sample,{fill:'none',stroke:color==='none'?'#7e7e7e':color,'stroke-width':computed(sample).strokeWidth||'2px'});
    const g=r.geometry,angles={top:180,right:270,bottom:0,left:90};
    const arrow=(point:{x:number;y:number},side:keyof typeof angles)=>`<polygon points="0,0 6.5,10.4 -6.5,10.4" transform="translate(${point.x} ${point.y}) rotate(${angles[side]})" fill="${esc(color==='none'?'#7e7e7e':color)}"/>`;
    return `<g data-edge-id="${esc(r.edge.id)}" data-from-node="${esc(r.edge.fromNode)}" data-to-node="${esc(r.edge.toNode)}" data-path-source="compatible"><path class="${lineClass}" d="${g.path}"/>${r.edge.fromEnd==='arrow'?arrow(g.from,g.fromSide):''}${r.edge.toEnd==='arrow'?arrow(g.to,g.toSide):''}</g>`;
  } finally {svg.remove();}
}

function theme(snap:Snapshot):Record<string,string> {
  const doc=snap.document,root=snap.native?.wrapperEl??doc.body,style=computed(root),body=computed(doc.body);
  const value=(name:string,fallback:string)=>body.getPropertyValue(name).trim()||fallback;
  const scrollbar=root.querySelector<HTMLElement>('.markdown-preview-view');
  const size=scrollbar?computed(scrollbar,'::-webkit-scrollbar').width:'12px';
  const dark=doc.body.classList.contains('theme-dark');
  return {'--sce-bg':style.backgroundColor==='rgba(0, 0, 0, 0)'?value('--background-primary','#1e1e1e'):style.backgroundColor,
    '--sce-text':body.color,'--sce-border':value('--background-modifier-border','#444'),'--sce-hover':value('--background-secondary','#282828'),
    '--sce-accent':value('--interactive-accent','#a68af9'),'--sce-scroll-thumb':value('--scrollbar-thumb-bg','rgba(128,128,128,.45)'),
    '--sce-search-accent':dark?'#b49bec':'#7052bf','--sce-search-hit-bg':dark?'#715416':'#ffe68a','--sce-search-hit-text':dark?'#fff0b8':'#32270b',
    '--sce-scrollbar':/^\d/.test(size)?size:'12px','color-scheme':dark?'dark':'light'};
}

export async function saveHTML(app:App,requested:string,html:string,signal:AbortSignal):Promise<string> {
  const initial=outputPath(requested);
  const parts=initial.split('/');parts.pop();let folder='';
  for(const part of parts){signal.throwIfAborted();folder=folder?`${folder}/${part}`:part;if(!await app.vault.adapter.exists(folder))await app.vault.createFolder(folder);}
  let path=initial,count=2;
  while(await app.vault.adapter.exists(path)){path=initial.replace(/\.html$/i,` (${count++}).html`);if(count>10000)throw Error('Too many numbered exports.');}
  signal.throwIfAborted();await app.vault.create(path,html);return path;
}
