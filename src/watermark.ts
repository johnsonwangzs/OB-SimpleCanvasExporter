export interface WatermarkOptions { enabled?:boolean; text?:string; opacity?:number }
export interface Watermark { text:string; opacity:number }

const line=(text:string)=>text.trim().replace(/\s+/gu,' ');
export function watermarkProblem(options?:WatermarkOptions):'empty'|'long'|undefined {
  if(!options?.enabled)return;
  const text=line(options.text??'');
  if(!text)return 'empty';
  if(Array.from(text).length>40)return 'long';
}
export function normalizeWatermark(options?:WatermarkOptions):Watermark|undefined {
  if(!options?.enabled||watermarkProblem(options))return;
  return {text:line(options.text??''),opacity:Math.max(4,Math.min(16,Number.isFinite(options.opacity)?options.opacity!:8))};
}

/** Also serialized into exported HTML: no module variables or Obsidian APIs. */
export function watermarkInk(background:string,doc:Document,fallback?:string):string {
  try {
    const canvas=doc.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d');
    if(context){
      context.fillStyle=background;context.fillRect(0,0,1,1);
      const rgba=context.getImageData(0,0,1,1).data;
      if(rgba[3]===255){
        const linear=Array.from(rgba.slice(0,3),v=>{const c=v/255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);});
        return .2126*linear[0]+.7152*linear[1]+.0722*linear[2]>.179?'#000000':'#ffffff';
      }
    }
  } catch { /* Retain a readable initial fallback if color conversion is unavailable. */ }
  return fallback??(doc.body.classList.contains('theme-dark')?'#ffffff':'#000000');
}

/** Build text through DOM APIs; user content never becomes markup or CSS. */
export function createWatermark(doc:Document,watermark:Watermark,background:string,id='sce-watermark-pattern'):SVGSVGElement {
  const ns='http://www.w3.org/2000/svg';
  const svg=doc.createElementNS(ns,'svg');svg.classList.add('sce-watermark');
  svg.setAttribute('xmlns',ns);svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  const ink=watermarkInk(background,doc);
  svg.style.setProperty('--sce-watermark-ink',ink);svg.style.setProperty('--sce-watermark-original-ink',ink);
  let measured=Array.from(watermark.text).length*24;
  try {const context=doc.createElement('canvas').getContext('2d');if(context){context.font='24px system-ui, sans-serif';measured=context.measureText(watermark.text).width;}}catch { /* Conservative character-width fallback. */ }
  // Leave enough space for the rotated text and modest font substitution differences.
  const stepX=Math.ceil(Math.max(360,Math.cos(Math.PI/6)*measured+15+96));
  const stepY=Math.ceil(Math.max(220,measured/2+Math.cos(Math.PI/6)*30+72));
  const defs=doc.createElementNS(ns,'defs'),pattern=doc.createElementNS(ns,'pattern');
  pattern.id=id;pattern.setAttribute('patternUnits','userSpaceOnUse');
  pattern.setAttribute('width',String(stepX*2));pattern.setAttribute('height',String(stepY*2));
  // Paint alpha directly, avoiding a rasterized group transparency layer in printed PDFs.
  const group=doc.createElementNS(ns,'g');group.setAttribute('fill','currentColor');group.setAttribute('fill-opacity',String(watermark.opacity/100));
  for(const [x,y] of [[stepX/2,stepY/2],[stepX*1.5,stepY/2],[0,stepY*1.5],[stepX,stepY*1.5],[stepX*2,stepY*1.5]]){
    const text=doc.createElementNS(ns,'text');text.textContent=watermark.text;
    text.setAttribute('x',String(x));text.setAttribute('y',String(y));text.setAttribute('transform',`rotate(-30 ${x} ${y})`);
    text.setAttribute('font-family','system-ui, sans-serif');text.setAttribute('font-size','24');text.setAttribute('font-weight','400');
    text.setAttribute('text-anchor','middle');text.setAttribute('dominant-baseline','central');group.appendChild(text);
  }
  pattern.appendChild(group);defs.appendChild(pattern);svg.appendChild(defs);
  const rect=doc.createElementNS(ns,'rect');rect.setAttribute('width','100%');rect.setAttribute('height','100%');rect.setAttribute('fill',`url(#${id})`);svg.appendChild(rect);
  return svg;
}
