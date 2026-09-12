import { type Snapshot } from '../src/runtime';
import { computed } from '../src/styles';

const PAINT = ['fill','stroke','stroke-width','stroke-opacity','stroke-dasharray','stroke-linecap','stroke-linejoin','opacity'];
interface EdgePaint { id:string; connected:boolean; path:string|null; line:Record<string,string>; arrows:Record<string,string>[] }

/** Record the live view before export so detached SVG cannot become its own reference. */
export function edgeReference(snap:Snapshot):EdgePaint[] {
  const paint=(el:Element)=>Object.fromEntries(PAINT.map(key=>[key,computed(el).getPropertyValue(key)]));
  const stage=snap.document.defaultView!.createDiv({cls:'canvas sce-staging'});
  (snap.native?.wrapperEl??snap.document.body).appendChild(stage);
  const svg=stage.createSvg('svg',{cls:'canvas-edges'});
  if(snap.native?.canvasEl)svg.style.setProperty('--zoom-multiplier',computed(snap.native.canvasEl).getPropertyValue('--zoom-multiplier'));
  try {return snap.data.edges.map(edge=>{
    const native=snap.native?.edges?.get(edge.id);
    let path=native?.lineGroupEl?.querySelector('.canvas-display-path');
    if(!path)throw Error(`Missing native edge: ${edge.id}`);
    const connected=path.isConnected;
    let ends=native?.lineEndGroupEl;
    if(!connected){const group=native!.lineGroupEl!.cloneNode(true) as SVGElement;svg.appendChild(group);path=group.querySelector('.canvas-display-path')!;}
    if(ends&&!ends.isConnected){ends=ends.cloneNode(true) as SVGElement;svg.appendChild(ends);}
    const result={id:edge.id,connected,path:path.getAttribute('d'),line:paint(path),arrows:Array.from(ends?.querySelectorAll('polygon')??[],paint)};
    svg.empty();return result;
  });} finally {stage.remove();}
}

/** Parse inert output and inspect the actual frozen paint, not just path existence. */
export function verifyEdgePaint(doc:Document,html:string,reference:EdgePaint[]):void {
  const win=doc.defaultView!;
  const output=new win.DOMParser().parseFromString(html,'text/html');
  const sheet=new win.CSSStyleSheet();sheet.replaceSync(output.querySelector('style')?.textContent??'');
  const rules=new Map<string,CSSStyleDeclaration>();
  for(const rule of Array.from(sheet.cssRules)){
    if(!(rule instanceof win.CSSStyleRule))continue;
    const styleRule=rule;
    if(/^\.sce-s\d+$/.test(styleRule.selectorText))rules.set(styleRule.selectorText.slice(1),styleRule.style);
  }
  const paint=(el:Element)=>{
    const cls=Array.from(el.classList).find(name=>rules.has(name));
    if(!cls)throw Error('Missing frozen SVG style.');
    return Object.fromEntries(PAINT.map(key=>[key,rules.get(cls)!.getPropertyValue(key)]));
  };
  const edges=Array.from(output.querySelectorAll('[data-edge-id]'));
  if(edges.length!==reference.length)throw Error('Exported edge count changed.');
  for(const expected of reference){
    const edge=edges.find(el=>el.getAttribute('data-edge-id')===expected.id);
    const path=edge?.querySelector('.canvas-display-path');
    if(!edge||!path||edge.getAttribute('data-path-source')!=='native')throw Error(`Missing exported native edge: ${expected.id}`);
    if(path.getAttribute('d')!==expected.path)throw Error(`Edge geometry changed: ${expected.id}`);
    const actual=paint(path);
    if(actual.stroke==='none'||parseFloat(actual['stroke-width'])<=0||parseFloat(actual['stroke-opacity'])<=0)throw Error(`Invisible edge: ${expected.id}`);
    for(const key of PAINT)if(actual[key]!==expected.line[key])throw Error(`${expected.id} ${key}: ${actual[key]} vs ${expected.line[key]}`);
    const arrows=Array.from(edge.querySelectorAll('polygon'),paint);
    if(arrows.length!==expected.arrows.length)throw Error(`Arrow count changed: ${expected.id}`);
    for(const [index,arrow] of arrows.entries())for(const key of PAINT)if(arrow[key]!==expected.arrows[index][key])throw Error(`${expected.id} arrow ${index} ${key} changed.`);
  }
}
