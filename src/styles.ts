import { escapeHTML } from './canvas';
import { badgeColor } from './badges';

const PROPERTIES = [
  'display','visibility','box-sizing','color','background-color','font-family','font-size','font-weight','font-style','font-variant','font-stretch',
  'line-height','letter-spacing','word-spacing','text-align','text-indent','text-transform','text-decoration-line','text-decoration-style','text-decoration-color',
  'text-underline-offset','text-shadow','text-rendering','white-space','word-break','overflow-wrap','tab-size','vertical-align','opacity',
  'margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left',
  'border-top-width','border-right-width','border-bottom-width','border-left-width','border-top-style','border-right-style','border-bottom-style','border-left-style',
  'border-top-color','border-right-color','border-bottom-color','border-left-color','border-top-left-radius','border-top-right-radius','border-bottom-left-radius','border-bottom-right-radius',
  'box-shadow','border-collapse','border-spacing','caption-side','table-layout','list-style-type','list-style-position',
  'flex-direction','flex-wrap','align-items','align-self','justify-content','gap','grid-template-columns',
  'overflow-x','overflow-y','object-fit','object-position','fill','stroke','stroke-width','stroke-dasharray','stroke-linecap','stroke-linejoin','fill-opacity','stroke-opacity',
];
function cleanValue(value: string): string { return /url\s*\(|expression\s*\(|[<>]/i.test(value) ? '' : value; }
export function computed(el: Element, pseudo?: string): CSSStyleDeclaration { return el.ownerDocument.defaultView!.getComputedStyle(el,pseudo); }

export class StyleBank {
  private rules = new Map<string,string>();
  add(style: Record<string,string>): string {
    const css=Object.entries(style).filter(([,v])=>v && cleanValue(v)).map(([k,v])=>`${k}:${v}`).join(';');
    let cls=this.rules.get(css);
    if (!cls) { cls=`sce-s${this.rules.size}`; this.rules.set(css,cls); }
    return cls;
  }
  capture(el:Element, extras:Record<string,string>={}, pseudo?:string): string {
    const style=computed(el,pseudo);
    return this.add({...Object.fromEntries(PROPERTIES.map(k=>[k,style.getPropertyValue(k)])),...extras});
  }
  css(): string { return Array.from(this.rules,([css,cls])=>`.${cls}{${css}}`).join('\n').replace(/</g,'\\3c '); }
}

const ALLOWED = new Set('div span p br hr a strong em b i u s del mark small sub sup code pre blockquote h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table thead tbody tfoot tr th td colgroup col center img input details summary svg g path polygon polyline circle ellipse rect line text tspan defs clippath lineargradient radialgradient stop title'.split(' '));
const ATTRS=new Set('alt title colspan rowspan start reversed value type checked disabled open hidden viewBox xmlns d points x y x1 y1 x2 y2 cx cy r rx ry width height offset gradientUnits gradientTransform preserveAspectRatio role aria-label aria-hidden'.toLowerCase().split(' '));

/** Convert rendered content to inert, styled HTML. Geometry and layout offsets never come from note HTML. */
export function freezeTree(source:Element, bank:StyleBank, prefix:string): HTMLElement {
  const doc=source.ownerDocument;
  const ids=new Map<string,string>();
  for (const e of [source,...source.querySelectorAll('[id]')]) if (e.id) ids.set(e.id,`${prefix}-${ids.size}`);
  function visit(node:Node): Node | null {
    if (node.nodeType===3) return doc.createTextNode(node.textContent??'');
    if (node.nodeType!==1) return null;
    const el=node as Element, tag=el.tagName.toLowerCase();
    if (!ALLOWED.has(tag) || (tag==='input' && el.getAttribute('type')!=='checkbox')) return null;
    if (el.matches('.markdown-preview-pusher,.copy-code-button,.collapse-indicator,.edit-block-button,.markdown-embed-link,.canvas-node-content-blocker')) return null;
    const internal=tag==='a' && (el.classList.contains('internal-link') || !/^(https?:|mailto:)/i.test(el.getAttribute('href')??''));
    const svg=el.namespaceURI==='http://www.w3.org/2000/svg';
    const clone=svg ? doc.defaultView!.createSvg(el.tagName as keyof SVGElementTagNameMap) : doc.defaultView!.createEl((internal?'span':tag) as keyof HTMLElementTagNameMap);
    for (const attr of Array.from(el.attributes)) {
      if (ATTRS.has(attr.name.toLowerCase()) && !/^on/i.test(attr.name)) clone.setAttribute(attr.name,attr.value);
    }
    if (el.id) clone.id=ids.get(el.id)!;
    if(tag==='span'&&el.classList.contains('badge')){
      const badge=badgeColor(el.classList,(el as HTMLElement).style.getPropertyValue('--simple-badge-color'));
      if(badge){clone.setAttribute('data-sce-badge-color-kind',badge.kind);clone.setAttribute('data-sce-badge-color',badge.color);}
    }
    if (tag==='img') {
      const src=el.getAttribute('src')??'';
      if (!/^data:image\/(png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(src)) {
        const placeholder=doc.defaultView!.createSpan({cls:'sce-resource-placeholder',text:el.getAttribute('alt')||'[Image unavailable]'});return placeholder;
      }
      clone.setAttribute('src',src);
    }
    if (tag==='a' && !internal) { clone.setAttribute('href',el.getAttribute('href')!); clone.setAttribute('target','_blank'); clone.setAttribute('rel','noopener noreferrer'); }
    if (tag==='input') { clone.setAttribute('disabled',''); if ((el as HTMLInputElement).checked) clone.setAttribute('checked',''); }
    const extras:Record<string,string>={};
    if (internal) extras.cursor='text';
    if (el.classList.contains('markdown-preview-sizer')) { extras['flex']='1 0 0px'; extras['min-height']='min-content'; }
    if (tag==='pre') extras['overflow-x']='auto';
    if (svg && computed(el).transform !== 'none') { extras.transform=computed(el).transform;extras['transform-origin']='0 0'; }
    if (tag==='img' || tag==='svg') {
      extras.width=computed(el).width; extras.height=computed(el).height; extras['max-width']='100%';
      if (tag==='img') extras.height='auto';
    }
    const classes=Array.from(el.classList).filter(c=>!['is-selected','is-focused','is-editing','node-insert-event'].includes(c));
    classes.push(bank.capture(el,extras));
    clone.setAttribute('class',classes.join(' '));
    for (const child of Array.from(el.childNodes)) { const copy=visit(child); if(copy)clone.appendChild(copy); }
    return clone;
  }
  return visit(source) as HTMLElement;
}

export function spacer(source:Element,bank:StyleBank,pseudo:'::before'|'::after'): string {
  const style=computed(source,pseudo);
  if (style.content==='none' || style.content==='normal' || style.display==='none') return '';
  const cls=bank.capture(source,{'min-height':style.minHeight,'max-height':style.maxHeight,flex:style.flex},pseudo);
  // Canvas uses empty pseudo elements for the top and bottom padding of its scroll container.
  const content=/^(['"]).*\1$/.test(style.content) ? style.content.slice(1,-1) : '';
  return `<div aria-hidden="true" class="${cls}">${escapeHTML(content)}</div>`;
}

export function ensureBadges(root:HTMLElement): boolean {
  let fallback=false;
  for (const badge of root.querySelectorAll<HTMLElement>('.badge')) {
    if (computed(badge).display==='inline-block') continue;
    fallback=true;
    const colorClass=Array.from(badge.classList).find(c=>/^badge-(blue|green|purple|red|orange|yellow|cyan|pink)$/.test(c));
    const color=badge.style.getPropertyValue('--simple-badge-color') || (colorClass ? `var(--color-${colorClass.slice(6)})` : 'var(--text-normal)');
    badge.addClass('sce-badge-fallback');badge.setCssProps({'--sce-badge-color':color});
  }
  return fallback;
}

export function resolveColor(color:string|undefined,host:HTMLElement):string|undefined {
  if(!color)return;
  const palette=['','red','orange','yellow','green','cyan','purple'];
  const token=/^[1-6]$/.test(color)?`var(--color-${palette[Number(color)]})`:/^#[0-9a-f]{6}$/i.test(color)?color:undefined;
  if(!token)return;
  const probe=host.createSpan({cls:'sce-color-probe'});probe.setCssProps({'--sce-probe-color':token});const result=computed(probe).color;probe.remove();return result;
}

export const viewerCSS = `
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{font:14px system-ui,sans-serif;background:var(--sce-bg);color:var(--sce-text)}
.sce-toolbar{background:var(--sce-bg);border-bottom:1px solid var(--sce-border);position:relative;z-index:20}.sce-toolbar-main{min-height:58px;display:flex;align-items:center;gap:14px;padding:10px 18px}
.sce-title{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.sce-count{font-size:12px;opacity:.65;white-space:nowrap}
.sce-controls{display:flex;gap:6px;align-items:center}button{font:inherit;color:inherit;background:transparent;border:1px solid var(--sce-border);border-radius:6px;padding:6px 10px;cursor:pointer}button:hover{background:var(--sce-hover)}button:focus-visible,.sce-card-scroll:focus-visible{outline:2px solid var(--sce-accent);outline-offset:-2px}.sce-zoom{min-width:54px;text-align:center;font-size:12px;font-variant-numeric:tabular-nums}
.sce-controls{flex-wrap:wrap;max-width:100%}.sce-background-trigger{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.sce-background-current{width:16px;height:16px;flex-shrink:0;border:1px solid var(--sce-border);border-radius:3px;background:var(--sce-canvas-bg,var(--sce-bg))}.sce-background-trigger[aria-expanded="true"]{border-color:var(--sce-accent)}
.sce-background-trigger[hidden],.sce-background-popup[hidden],.sce-background-popup [hidden]{display:none}.sce-background-popup{position:fixed;z-index:30;width:288px;max-width:calc(100vw - 16px);padding:16px;overflow:auto;overscroll-behavior:contain;background:var(--sce-bg);color:var(--sce-text);border:1px solid var(--sce-border);border-radius:10px;box-shadow:0 8px 32px #0003}.sce-background-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.sce-background-close{font-size:20px;line-height:1}.sce-background-label{display:block;margin:12px 0 6px;font-size:12px}.sce-background-presets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.sce-background-preset{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;padding:6px;font-size:12px;overflow-wrap:anywhere}.sce-background-swatch{width:100%;height:22px;border:1px solid var(--sce-border);border-radius:3px}.sce-background-preset[aria-pressed="true"]{outline:2px solid var(--sce-accent);outline-offset:-2px}.sce-background-check{display:none;position:absolute;right:3px;bottom:1px;color:var(--sce-accent)}.sce-background-preset[aria-pressed="true"] .sce-background-check{display:block}
.sce-background-inputs{display:flex;gap:8px}.sce-background-inputs input{min-width:0;font:inherit;background:var(--sce-bg);color:var(--sce-text);border:1px solid var(--sce-border);border-radius:6px}.sce-background-picker{width:44px;min-height:38px;padding:4px;flex-shrink:0;cursor:pointer}.sce-background-hex{width:100%;padding:7px 9px;font-variant-numeric:tabular-nums}.sce-background-inputs input:focus-visible{outline:2px solid var(--sce-accent);outline-offset:1px}.sce-background-error{font-size:12px;margin:6px 0}.sce-background-hex[aria-invalid="true"]{border-style:dashed}.sce-background-reset{margin-top:14px;width:100%;white-space:normal}.sce-background-reset:disabled{opacity:.45;cursor:default}.sce-background-status{display:block;margin-top:10px;font-size:12px;min-height:18px;overflow-wrap:anywhere}.sce-background-scope{font-size:12px;margin:8px 0 0}
@media(pointer:coarse){.sce-background-popup button,.sce-background-popup input,.sce-background-trigger{min-height:44px;min-width:44px}.sce-background-hex{font-size:16px!important}}
.sce-search{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:0 18px 10px}.sce-search[hidden],.sce-search [hidden]{display:none}.sce-search-input{display:flex;align-items:center;gap:6px;flex:1 1 260px;max-width:440px;min-width:0}.sce-search-input input{width:100%;min-width:0;font:inherit;color:var(--sce-text);background:var(--sce-hover);border:1px solid var(--sce-border);border-radius:6px;padding:7px 10px}.sce-search-input input:focus-visible{outline:2px solid var(--sce-accent);outline-offset:1px}.sce-search-input input::-webkit-search-cancel-button{display:none}.sce-search-actions{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}.sce-search button{white-space:nowrap}.sce-search button:disabled{opacity:.45;cursor:default}.sce-dim-label{display:flex;gap:5px;align-items:center;white-space:nowrap;cursor:pointer}.sce-dim-label input{accent-color:var(--sce-accent)}.sce-search-status{font-size:12px;font-variant-numeric:tabular-nums;min-width:170px}.sce-search-fallback{font-size:12px}.sce-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
::highlight(sce-search),::highlight(sce-reader-search){background-color:var(--sce-search-hit-bg,#ffe68a);color:var(--sce-search-hit-text,#32270b);text-shadow:none}
.sce-badge-filter[hidden],.sce-badge-filter [hidden],.sce-badge-popup[hidden],.sce-badge-popup [hidden],.sce-reader-excluded[hidden]{display:none}
.sce-badge-filter{padding:0 18px 10px;min-width:0}.sce-badge-heading{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;margin-bottom:6px;font-size:12px}.sce-badge-heading>span{font-weight:600}.sce-badge-selected{min-width:70px;font-variant-numeric:tabular-nums}.sce-badge-mode{font:inherit;color:var(--sce-text);background:var(--sce-bg);border:1px solid var(--sce-border);border-radius:6px;padding:5px}.sce-badge-heading button:disabled{opacity:.45;cursor:default}.sce-badge-chips{display:flex;flex-wrap:wrap;gap:6px;min-width:0}
.sce-badge-chip{display:inline-flex;align-items:center;gap:5px;max-width:100%;min-width:0;min-height:32px;padding:4px 8px;font:13px/1.5 system-ui,sans-serif;color:var(--sce-badge-ink);background:var(--sce-badge-bg);border:1px solid var(--sce-border);border-radius:6px}.sce-badge-chip:hover{background:var(--sce-badge-bg);box-shadow:inset 0 0 0 1px currentColor}.sce-badge-chip[aria-pressed="true"]{outline:2px solid var(--sce-accent);outline-offset:-2px}.sce-badge-check{width:12px;flex-shrink:0;visibility:hidden}.sce-badge-chip[aria-pressed="true"] .sce-badge-check{visibility:visible}.sce-badge-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.sce-badge-count{font-size:11px;font-variant-numeric:tabular-nums;flex-shrink:0}.sce-badge-chip:focus-visible,.sce-badge-mode:focus-visible,.sce-badge-find:focus-visible{outline:2px solid var(--sce-accent);outline-offset:2px}
.sce-badge-popup{position:fixed;z-index:30;right:12px;width:min(480px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain;padding:14px;background:var(--sce-bg);color:var(--sce-text);border:1px solid var(--sce-border);border-radius:10px;box-shadow:0 8px 32px #0003}.sce-badge-popup-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.sce-badge-close{font-size:20px;line-height:1}.sce-badge-find{width:100%;font:inherit;color:var(--sce-text);background:var(--sce-hover);border:1px solid var(--sce-border);border-radius:6px;padding:8px}.sce-badge-help,.sce-badge-empty{font-size:12px;line-height:1.5;margin:10px 0}.sce-badge-list{display:flex;flex-wrap:wrap;gap:8px}.sce-badge-list .sce-badge-name{white-space:normal;overflow-wrap:anywhere}.sce-reader-excluded{flex-shrink:0;font-size:12px;margin:0;padding:8px 16px;border-bottom:1px solid var(--sce-border)}
@media(max-width:650px){.sce-badge-filter{padding:0 8px 8px}.sce-badge-heading{gap:6px}.sce-badge-popup{right:8px;width:calc(100vw - 16px)}}
@media(pointer:coarse){.sce-badge-filter button,.sce-badge-mode,.sce-badge-popup button,.sce-badge-find{min-height:44px}.sce-badge-find{font-size:16px}}
@media print{.sce-badge-popup{display:none!important}}
.sce-card.sce-search-dim:not(:hover):not(:focus-within):not(.sce-reading){opacity:calc(var(--sce-original-opacity,1)*.4)}.sce-search-edge-faint{opacity:calc(var(--sce-original-opacity,1)*.2)!important}.sce-search-edge-related{opacity:calc(var(--sce-original-opacity,1)*.6)!important}
.sce-search-ring{position:absolute;pointer-events:none;outline:var(--sce-search-line,2px) solid var(--sce-search-accent,var(--sce-accent));outline-offset:var(--sce-search-gap,2px)}.sce-search-ring.sce-search-current{outline-width:var(--sce-search-active-line,3px)}.sce-search-current::after{content:attr(data-current);position:absolute;right:0;bottom:calc(100% + var(--sce-search-gap,2px));transform:scale(var(--sce-inverse-zoom,1));transform-origin:right bottom;padding:1px 5px;background:var(--sce-bg);color:var(--sce-search-accent,var(--sce-accent));border-radius:3px;font:12px/1.5 system-ui,sans-serif;white-space:nowrap}.sce-search-tiny .sce-search-current::after{display:none}
.sce-viewport{position:absolute;inset:58px 0 0;overflow:auto;overscroll-behavior:none;background:var(--sce-canvas-bg,var(--sce-bg))}.sce-viewport.sce-interactive{overflow:hidden;touch-action:none;cursor:grab}.sce-viewport.sce-dragging{cursor:grabbing;user-select:none}.sce-scene{position:relative;transform-origin:0 0}.sce-interactive .sce-scene{position:absolute;left:0;top:0}
.sce-edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.sce-card{position:absolute;overflow:hidden;isolation:isolate;cursor:auto}.sce-card-scroll{width:100%;height:100%;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;cursor:auto;user-select:text;scrollbar-gutter:stable;touch-action:pan-x pan-y}
.sce-card-scroll::-webkit-scrollbar{width:var(--sce-scrollbar,12px);height:var(--sce-scrollbar,12px)}.sce-card-scroll::-webkit-scrollbar-thumb{background:var(--sce-scroll-thumb);border:3px solid transparent;border-radius:8px;background-clip:padding-box}.sce-card-scroll::-webkit-scrollbar-track{background:transparent}
.sce-card-scroll img{max-width:100%;height:auto}.sce-placeholder{padding:16px;font:14px/1.6 system-ui,sans-serif;overflow-wrap:anywhere}.sce-help{position:fixed;bottom:12px;left:16px;max-width:calc(100% - 32px);padding:6px 10px;border-radius:6px;background:var(--sce-bg);color:var(--sce-text);font-size:12px;opacity:.7;pointer-events:none}.sce-empty{padding:50px;font-size:18px}.sce-edge-label{position:absolute;font:14px/1.4 system-ui,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;max-width:260px;transform:translate(-50%,-50%);background:var(--sce-bg);padding:3px 6px;border-radius:4px;pointer-events:none}
.sce-reader[hidden]{display:none}.sce-reader{position:absolute;inset:58px 0 0 auto;width:min(480px,45vw);z-index:15;display:flex;flex-direction:column;min-height:0;background:var(--sce-bg);color:var(--sce-text);border-left:1px solid var(--sce-border)}.sce-reader-open .sce-viewport{right:min(480px,45vw)}.sce-reader-open .sce-help{max-width:calc(55vw - 32px)}
.sce-reader-header{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:12px 16px;border-bottom:1px solid var(--sce-border);flex-shrink:0}.sce-reader-header>span{font-weight:600;margin-right:auto}.sce-reader-font-controls{display:flex;gap:6px;align-items:center}.sce-reader-font{min-width:32px;text-align:center;font-size:12px;font-variant-numeric:tabular-nums}.sce-reader button:disabled{opacity:.4;cursor:default}.sce-reader-close{font-size:20px;line-height:1;border:0}.sce-reader-body{flex:1;min-height:0;min-width:0;padding:24px;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;overflow-wrap:anywhere;font-size:var(--sce-reader-font,16px);line-height:1.65;user-select:text}.sce-reader-body:focus-visible{outline:2px solid var(--sce-accent);outline-offset:-2px}
.sce-reader-body .sce-reader-content{width:100%;height:auto;min-width:0;min-height:0;max-width:none;max-height:none;flex:none;margin:0;padding:0;border:0;overflow:visible}.sce-reader-content *{min-width:0}.sce-reader-content img{max-width:100%;height:auto}.sce-reader-content pre,.sce-reader-content .sce-reader-table{max-width:100%;overflow:auto;overscroll-behavior:contain}.sce-reader-content .sce-reader-table{display:block}.sce-reader-content table{max-width:none}.sce-reader-content a{overflow-wrap:anywhere}.sce-reader-content .sce-reader-table:focus-visible,.sce-reader-content pre:focus-visible{outline:2px solid var(--sce-accent);outline-offset:-2px}
.sce-reader-anchor{position:absolute;pointer-events:none}.sce-reader-trigger{position:absolute;right:0;top:0;transform:scale(var(--sce-inverse-zoom,1)) translate(-5px,5px);transform-origin:right top;pointer-events:auto;background:var(--sce-bg);color:var(--sce-text);font:12px/1.5 system-ui,sans-serif;white-space:nowrap;padding:4px 8px;opacity:0}.sce-card:hover+.sce-reader-anchor .sce-reader-trigger,.sce-card:focus-within+.sce-reader-anchor .sce-reader-trigger,.sce-reader-anchor:hover .sce-reader-trigger,.sce-reader-anchor:focus-within .sce-reader-trigger{opacity:1}.sce-reader-trigger-symbol{display:none}.sce-reader-source-label{position:absolute;left:0;top:0;transform:scale(var(--sce-inverse-zoom,1)) translateY(-100%);transform-origin:left top;background:var(--sce-bg);color:var(--sce-accent);font:12px/1.5 system-ui,sans-serif;white-space:nowrap;padding:1px 5px;border-radius:3px}.sce-reader-source-label[hidden]{display:none}.sce-search-tiny .sce-reader-source-label{display:none}.sce-search-tiny .sce-reader-trigger-text{display:none}.sce-search-tiny .sce-reader-trigger-symbol{display:inline}
@media(min-width:900px){.sce-reader-open .sce-search-current.sce-reader-current-source::after{bottom:auto;top:calc(100% + var(--sce-search-gap,2px));transform-origin:right top}}
@media(max-width:899px){.sce-reader{width:100%;border-left:0}.sce-reader-open .sce-viewport{right:0;pointer-events:none}.sce-reader-open .sce-help{display:none}.sce-reader-header{padding:10px 12px}.sce-reader-body{padding:20px}}
@media(max-width:650px){.sce-count{display:none}.sce-toolbar-main{gap:6px;padding:8px;flex-wrap:wrap}.sce-title{font-size:12px;min-width:70px}.sce-controls{gap:3px}button{padding:6px}.sce-search{padding:0 8px 8px;gap:8px}.sce-search-input{flex-basis:100%;max-width:none}.sce-search-status{flex-basis:100%}.sce-search-actions{gap:6px}.sce-help{display:none}}
@media(pointer:coarse){.sce-search button,.sce-search-input input{min-height:44px}.sce-search-input input{font-size:16px}.sce-dim-label{min-height:44px}}
@media(pointer:coarse){.sce-reader button,.sce-reader-trigger{min-height:44px;min-width:44px}.sce-reader-trigger{opacity:1}.sce-search-tiny .sce-reader-trigger{opacity:0}.sce-search-tiny .sce-card:hover+.sce-reader-anchor .sce-reader-trigger,.sce-search-tiny .sce-card:focus-within+.sce-reader-anchor .sce-reader-trigger,.sce-search-tiny .sce-reader-anchor:hover .sce-reader-trigger,.sce-search-tiny .sce-reader-anchor:focus-within .sce-reader-trigger{opacity:1}}
.sce-empty{display:inline-block;background:var(--sce-bg);color:var(--sce-text)}
@media print{html,body{overflow:visible}.sce-toolbar,.sce-help,.sce-search-ring,.sce-reader,.sce-reader-anchor,.sce-background-popup{display:none!important}.sce-viewport{position:static;overflow:visible!important;background:var(--sce-bg)}.sce-scene{position:relative!important;transform:none!important}.sce-card.sce-search-dim,.sce-search-edge-faint,.sce-search-edge-related{opacity:var(--sce-original-opacity,1)!important}::highlight(sce-search){background-color:transparent;color:inherit}}
`;
