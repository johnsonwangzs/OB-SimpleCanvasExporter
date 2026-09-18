import { TextFileView, type View, type TFile } from 'obsidian';
import { anchor, edgeSides, parseCanvas, type CanvasData, type CanvasNode, type CanvasEdge, type Bounds } from './canvas';

interface NativeNode { nodeEl?: HTMLElement; contentEl?: HTMLElement; getData?: () => unknown }
interface NativeEdge { lineGroupEl?: SVGElement; lineEndGroupEl?: SVGElement; getData?: () => Record<string,unknown>; labelEl?: HTMLElement }
export interface NativeCanvas { nodes?: Map<string,NativeNode>; edges?: Map<string,NativeEdge>; wrapperEl?: HTMLElement; canvasEl?: HTMLElement }
export interface Snapshot { data:CanvasData; file:TFile; native:NativeCanvas | undefined; document:Document }
export function snapshot(view: View): Snapshot {
  if (view.getViewType() !== 'canvas' || !(view instanceof TextFileView) || !view.file) throw Error('Open a Canvas file before exporting.');
  const raw=view.getViewData();
  const candidate=(view as unknown as {canvas?:NativeCanvas}).canvas;
  return {data:parseCanvas(raw),file:view.file,native:candidate,document:view.containerEl.ownerDocument};
}

export function matchingNode(native:NativeCanvas|undefined,n:CanvasNode): HTMLElement | undefined {
  try {
    const source=native?.nodes?.get(n.id), data=source?.getData?.() as CanvasNode | undefined;
    return data && ['x','y','width','height','text','color','type','label'].every(k=>data[k as keyof CanvasNode]===n[k as keyof CanvasNode]) ? source?.nodeEl : undefined;
  } catch { return undefined; }
}
export interface NativePath { path:string; ends:SVGElement|undefined; line:SVGElement; group:SVGElement; bounds:Bounds }
export function matchingPath(native:NativeCanvas|undefined,e:CanvasEdge,a:CanvasNode,b:CanvasNode): NativePath | undefined {
  try {
    if (!matchingNode(native,a) || !matchingNode(native,b)) return;
    const edge=native?.edges?.get(e.id), data=edge?.getData?.();
    if (!data || ['fromNode','toNode','fromSide','toSide','color','label'].some(k=>data[k]!==e[k as keyof CanvasEdge])
      || (data.fromEnd??'none')!==e.fromEnd || (data.toEnd??'arrow')!==e.toEnd) return;
    const group=edge?.lineGroupEl,line=group?.querySelector<SVGElement>('.canvas-display-path');
    const path=line?.getAttribute('d');
    if (!group || !line || !path || !/^[\s\d.,+eEMmLlCcZz-]+$/.test(path)) return;
    const nums=(path.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)??[]).map(Number);
    if (nums.length<4 || nums.length%2 || nums.some(n=>!Number.isFinite(n))) return;
    const [as,bs]=edgeSides(e,a,b), start=anchor(a,as), end=anchor(b,bs);
    if (Math.hypot(nums[0]-start.x,nums[1]-start.y)>12 || Math.hypot(nums.at(-2)!-end.x,nums.at(-1)!-end.y)>12) return;
    const xs=nums.filter((_,i)=>i%2===0), ys=nums.filter((_,i)=>i%2===1);
    return {path,line,group,ends:edge?.lineEndGroupEl,bounds:{minX:Math.min(...xs)-16,minY:Math.min(...ys)-16,maxX:Math.max(...xs)+16,maxY:Math.max(...ys)+16}};
  } catch { return undefined; }
}
