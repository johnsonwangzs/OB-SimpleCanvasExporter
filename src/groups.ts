import { type Bounds, type CanvasNode, escapeHTML } from './canvas';
import { computed, resolveColor, type StyleBank } from './styles';

/** Sample a group at 100% without exporting editor controls or live DOM handlers. */
export function renderGroup(n:CanvasNode,source:HTMLElement|undefined,stage:HTMLElement,bank:StyleBank):{html:string;visualBounds:Bounds} {
  const doc=stage.ownerDocument;
  const host=(source?.cloneNode(false)??doc.defaultView!.createDiv()) as HTMLElement;
  host.classList.add('canvas-node','canvas-node-group','sce-render-node');
  host.classList.remove('is-selected','is-focused','is-editing','is-dragging');
  host.removeAttribute('data-collapsed');
  for(const property of ['position','transform','width','height'])host.style.removeProperty(property);
  host.setCssProps({'--canvas-node-width':`${n.width}px`,'--canvas-node-height':`${n.height}px`});
  if(n.color){const color=resolveColor(n.color,stage);if(color){host.classList.add('is-themed');host.style.setProperty('--canvas-color',color);}}
  const clone=(selector:string,cls:string,parent:HTMLElement):HTMLElement=>{
    const el=(source?.querySelector(selector)?.cloneNode(false)??doc.defaultView!.createDiv({cls})) as HTMLElement;
    parent.appendChild(el);return el;
  };
  const frame=clone('.canvas-node-container','canvas-node-container',host);
  const content=clone('.canvas-node-content','canvas-node-content',frame);
  const label=clone('.canvas-group-label','canvas-group-label',host);
  label.removeAttribute('contenteditable');label.textContent=n.label??'';
  stage.appendChild(host);
  try {
    const frameClass=bank.capture(frame),contentClass=bank.capture(content,{width:'100%',height:'100%'});
    const visualBounds:Bounds={minX:n.x,minY:n.y,maxX:n.x+n.width,maxY:n.y+n.height};
    let labelHTML='';
    if(n.label){
      const style=computed(label),hostRect=host.getBoundingClientRect(),rect=label.getBoundingClientRect();
      // Labels can extend above or beyond the frame. Include them in Fit all.
      visualBounds.minX=Math.min(n.x,n.x+rect.left-hostRect.left);
      visualBounds.minY=Math.min(n.y,n.y+rect.top-hostRect.top);
      visualBounds.maxX=Math.max(n.x+n.width,n.x+rect.right-hostRect.left);
      visualBounds.maxY=Math.max(n.y+n.height,n.y+rect.bottom-hostRect.top);
      const layout=Object.fromEntries(['position','left','top','width','height','max-width','transform','transform-origin','text-overflow'].map(k=>[k,style.getPropertyValue(k)]));
      // Preserve natural label sizing when the browser substitutes an Obsidian-only font.
      const labelClass=bank.capture(label,{...layout,width:'max-content'});
      labelHTML=`<div class="sce-group-label ${labelClass}" title="${escapeHTML(n.label)}">${escapeHTML(n.label)}</div>`;
    }
    return {html:`<div class="sce-group-frame ${frameClass}"><div class="${contentClass}"></div></div>${labelHTML}`,visualBounds};
  }finally{host.remove();}
}
