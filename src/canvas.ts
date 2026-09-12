export type Side = 'top' | 'right' | 'bottom' | 'left';
export type End = 'none' | 'arrow';
export interface CanvasNode {
  id: string; type: string; x: number; y: number; width: number; height: number;
  text?: string; color?: string; file?: string; url?: string; label?: string;
}
export interface CanvasEdge {
  id: string; fromNode: string; toNode: string; fromSide?: Side; toSide?: Side;
  fromEnd: End; toEnd: End; color?: string; label?: string;
}
export interface CanvasData { nodes: CanvasNode[]; edges: CanvasEdge[]; warnings: string[] }
const sides: Side[] = ['top','right','bottom','left'];
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';

export function parseCanvas(raw: string): CanvasData {
  const value: unknown = JSON.parse(raw);
  if (!isObject(value)) throw Error('Invalid Canvas: expected an object.');
  if ((value.nodes !== undefined && !Array.isArray(value.nodes)) || (value.edges !== undefined && !Array.isArray(value.edges))) throw Error('Invalid Canvas node/edge lists.');
  const ids = new Set<string>();
  const warnings: string[] = [];
  const nodes = (value.nodes ?? []) as unknown[];
  if (nodes.length > 10000) throw Error('This export supports up to 10,000 cards.');
  const parsedNodes: CanvasNode[] = nodes.map((n, i) => {
    if (!isObject(n) || !str(n.id) || !n.id || !str(n.type) || ids.has(n.id)) throw Error(`Invalid or duplicate card at index ${i}.`);
    if (!['x','y','width','height'].every(k => typeof n[k] === 'number' && Number.isFinite(n[k]) && Math.abs(n[k]) < 1e8)
      || (n.width as number) <= 0 || (n.height as number) <= 0) throw Error(`Invalid card dimensions: ${n.id}`);
    if (n.type === 'text' && !str(n.text)) throw Error(`Missing card text: ${n.id}`);
    ids.add(n.id);
    return {
      id:n.id, type:n.type, x:n.x as number, y:n.y as number, width:n.width as number, height:n.height as number,
      ...Object.fromEntries(['text','color','file','url','label'].filter(k=>str(n[k])).map(k=>[k,n[k]])),
    };
  });
  const edgeIds = new Set<string>();
  const parsedEdges: CanvasEdge[] = [];
  const edges = (value.edges ?? []) as unknown[];
  if (edges.length > 30000) throw Error('This export supports up to 30,000 connections.');
  for (const [i,e] of edges.entries()) {
    if (!isObject(e) || !str(e.id) || !e.id || edgeIds.has(e.id)) throw Error(`Invalid or duplicate connection at index ${i}.`);
    edgeIds.add(e.id);
    if (!str(e.fromNode) || !str(e.toNode) || !ids.has(e.fromNode) || !ids.has(e.toNode)) {
      warnings.push(`Connection ${e.id}: missing source or destination card.`); continue;
    }
    for (const k of ['fromSide','toSide']) if (e[k] !== undefined && !sides.includes(e[k] as Side)) throw Error(`Invalid connection side: ${e.id}`);
    for (const k of ['fromEnd','toEnd']) if (e[k] !== undefined && !['none','arrow'].includes(e[k] as string)) throw Error(`Invalid connection endpoint: ${e.id}`);
    parsedEdges.push({ id:e.id, fromNode:e.fromNode, toNode:e.toNode, fromSide:e.fromSide as Side | undefined, toSide:e.toSide as Side | undefined,
      fromEnd:(e.fromEnd ?? 'none') as End, toEnd:(e.toEnd ?? 'arrow') as End,
      color:str(e.color) ? e.color : undefined, label:str(e.label) ? e.label : undefined });
  }
  return {nodes:parsedNodes,edges:parsedEdges,warnings};
}

export interface Point { x: number; y: number }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export const vectors: Record<Side, Point> = {top:{x:0,y:-1},right:{x:1,y:0},bottom:{x:0,y:1},left:{x:-1,y:0}};
export function anchor(n: CanvasNode, side: Side): Point {
  return {x:n.x + (side === 'left' ? 0 : side === 'right' ? n.width : n.width/2), y:n.y + (side === 'top' ? 0 : side === 'bottom' ? n.height : n.height/2)};
}
function facing(a: CanvasNode, b: CanvasNode): Side {
  const dx=b.x+b.width/2-a.x-a.width/2, dy=b.y+b.height/2-a.y-a.height/2;
  return Math.abs(dx)>Math.abs(dy) ? dx>=0 ? 'right':'left' : dy>=0 ? 'bottom':'top';
}
export function edgeSides(e: CanvasEdge, a: CanvasNode, b: CanvasNode): [Side,Side] {
  return [e.fromSide ?? facing(a,b), e.toSide ?? facing(b,a)];
}
export interface EdgeGeometry { path: string; bounds: Bounds; center: Point; from: Point; to: Point; fromSide: Side; toSide: Side }
export function fallbackGeometry(e: CanvasEdge, a: CanvasNode, b: CanvasNode): EdgeGeometry {
  const [fromSide,toSide]=edgeSides(e,a,b), from=anchor(a,fromSide), to=anchor(b,toSide);
  const v=vectors[fromSide], w=vectors[toSide];
  const p={x:from.x+v.x*7,y:from.y+v.y*7}, q={x:to.x+w.x*7,y:to.y+w.y*7};
  // Calibrated against the native 1.13.7 Canvas paths. Exact paths are preferred when available.
  const distance=Math.min(150,Math.max(70,Math.hypot(q.x-p.x,q.y-p.y)/2));
  const c={x:p.x+v.x*distance,y:p.y+v.y*distance}, d={x:q.x+w.x*distance,y:q.y+w.y*distance};
  const start=e.fromEnd==='none' ? `M${from.x} ${from.y} L${p.x} ${p.y} ` : '';
  const end=e.toEnd==='none' ? ` L${to.x} ${to.y}` : '';
  const path=`${start}M${p.x},${p.y} C${c.x},${c.y} ${d.x},${d.y} ${q.x},${q.y}${end}`;
  return {path,from,to,fromSide,toSide,center:{x:(p.x+3*c.x+3*d.x+q.x)/8,y:(p.y+3*c.y+3*d.y+q.y)/8},
    bounds:{minX:Math.min(from.x,to.x,c.x,d.x)-12,minY:Math.min(from.y,to.y,c.y,d.y)-12,maxX:Math.max(from.x,to.x,c.x,d.x)+12,maxY:Math.max(from.y,to.y,c.y,d.y)+12}};
}
export function sceneBounds(nodes: CanvasNode[], edges: Bounds[]): Bounds {
  if (!nodes.length) return {minX:0,minY:0,maxX:640,maxY:360};
  const rects:Bounds[]=[...nodes.map(n=>({minX:n.x,minY:n.y,maxX:n.x+n.width,maxY:n.y+n.height})),...edges];
  return rects.reduce((r,b)=>({minX:Math.min(r.minX,b.minX),minY:Math.min(r.minY,b.minY),maxX:Math.max(r.maxX,b.maxX),maxY:Math.max(r.maxY,b.maxY)}),rects[0]);
}
export function escapeHTML(value: string): string { return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }

export function outputPath(input: string): string {
  const path=input.trim().replace(/\\/g,'/');
  if (!path || path.startsWith('/') || /[:<>"|?*]/.test(path) || Array.from(path).some(c=>c.charCodeAt(0)<32) || !/\.html$/i.test(path)) throw Error('Use a vault-relative path ending in .html.');
  const parts=path.split('/');
  if (parts.some(p=>!p || p==='.' || p==='..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p) || p.startsWith('.'))) throw Error('Invalid output folder or filename.');
  return path;
}
