/* Standalone browser runtime: Obsidian DOM extensions are unavailable here. */
/** Serialized into the exported document. Keep this function self-contained. */
export function startViewer(currentLabel='Current'):void {
  const viewport=document.querySelector<HTMLElement>('.sce-viewport')!;
  const scene=document.querySelector<HTMLElement>('.sce-scene')!;
  const zoomLabel=document.querySelector<HTMLElement>('.sce-zoom')!;
  const toolbar=document.querySelector<HTMLElement>('.sce-toolbar')!;
  const reader=document.querySelector<HTMLElement>('.sce-reader');
  const width=Number(scene.dataset.width),height=Number(scene.dataset.height);
  let scale=1,x=0,y=0,drag:{id:number;x:number;y:number;startX:number;startY:number}|undefined;
  let oldWidth=viewport.clientWidth,oldHeight=viewport.clientHeight;
  function syncViewport():void {
    x+=(viewport.clientWidth-oldWidth)/2;y+=(viewport.clientHeight-oldHeight)/2;
    oldWidth=viewport.clientWidth;oldHeight=viewport.clientHeight;
  }
  function paint():void {
    scene.style.transform=`translate(${x}px,${y}px) scale(${scale})`;
    scene.dataset.zoom=String(scale);scene.dataset.panX=String(x);scene.dataset.panY=String(y);
    zoomLabel.textContent=`${Math.round(scale*100)}%`;
    scene.style.setProperty('--sce-search-line',`${2/scale}px`);
    scene.style.setProperty('--sce-search-active-line',`${3/scale}px`);
    scene.style.setProperty('--sce-search-gap',`${2/scale}px`);
    scene.style.setProperty('--sce-inverse-zoom',String(1/scale));
    scene.classList.toggle('sce-search-tiny',scale<.15);
  }
  function fit():void {syncViewport();scale=Math.max(.01,Math.min(1,(viewport.clientWidth-48)/width,(viewport.clientHeight-48)/height));x=(viewport.clientWidth-width*scale)/2;y=(viewport.clientHeight-height*scale)/2;paint();}
  function zoom(next:number,px=viewport.clientWidth/2,py=viewport.clientHeight/2):void {
    syncViewport();
    next=Math.max(.01,Math.min(4,next));const ratio=next/scale;x=px-(px-x)*ratio;y=py-(py-y)*ratio;scale=next;paint();
  }
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-action]'))button.addEventListener('click',()=>{
    const action=button.dataset.action;
    if(action==='fit')fit();else if(action==='reset')zoom(1);else if(action==='in')zoom(scale*1.2);else if(action==='out')zoom(scale/1.2);
  });
  viewport.addEventListener('wheel',event=>{
    if(event.ctrlKey||event.metaKey){event.preventDefault();const r=viewport.getBoundingClientRect();zoom(scale*Math.exp(-event.deltaY*.003),event.clientX-r.left,event.clientY-r.top);return;}
    if((event.target as Element).closest('.sce-card-scroll'))return;
    event.preventDefault();const unit=event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1;
    x-=event.deltaX*unit;y-=event.deltaY*unit;paint();
  },{passive:false});
  viewport.addEventListener('pointerdown',event=>{
    if(event.button!==0||(event.target as Element).closest('.sce-card,.sce-reader-anchor'))return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:x,startY:y};viewport.setPointerCapture(event.pointerId);viewport.classList.add('sce-dragging');
  });
  viewport.addEventListener('pointermove',event=>{if(drag?.id===event.pointerId){x=drag.startX+event.clientX-drag.x;y=drag.startY+event.clientY-drag.y;paint();}});
  const end=()=>{drag=undefined;viewport.classList.remove('sce-dragging');};
  viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);viewport.addEventListener('lostpointercapture',end);
  viewport.addEventListener('keydown',event=>{
    if((event.target as Element).closest('.sce-card,.sce-reader-anchor'))return;
    if(event.key==='0'){zoom(1);event.preventDefault();}else if(event.key==='1'){fit();event.preventDefault();}
    else if(event.key==='+'||event.key==='='){zoom(scale*1.2);event.preventDefault();}else if(event.key==='-'){zoom(scale/1.2);event.preventDefault();}
  });
  const search=document.querySelector<HTMLElement>('.sce-search')!;
  search.hidden=false;
  const layoutToolbar=()=>{const top=`${toolbar.getBoundingClientRect().height}px`;viewport.style.top=top;if(reader)reader.style.top=top;};

  // Everything below is serialized with this function: no imported runtime helpers.
  interface Normalized {text:string;starts?:Uint32Array;ends?:Uint32Array}
  interface Segment extends Normalized {node:Text;start:number;end:number;skip:number}
  interface TextIndex {text:string;segments:Segment[]}
  interface CardIndex extends TextIndex {el:HTMLElement;scroll:HTMLElement;left:number;top:number;width:number;height:number}
  interface Result {card:CardIndex;offsets:number[]}
  const input=search.querySelector<HTMLInputElement>('input[type="search"]')!;
  const dim=search.querySelector<HTMLInputElement>('.sce-search-dim-toggle')!;
  const status=search.querySelector<HTMLOutputElement>('.sce-search-status')!;
  const buttons=Array.from(search.querySelectorAll<HTMLButtonElement>('[data-search-action]'));
  const allCards=Array.from(scene.querySelectorAll<HTMLElement>('.sce-card'));
  const edges=Array.from(scene.querySelectorAll<HTMLElement|SVGElement>('[data-from-node][data-to-node]'));
  const registry=typeof CSS!=='undefined'&&'highlights' in CSS&&typeof Highlight!=='undefined'?CSS.highlights:undefined;
  search.querySelector<HTMLElement>('.sce-search-fallback')!.hidden=!!registry;
  for(const el of [...allCards,...edges])el.style.setProperty('--sce-original-opacity',getComputedStyle(el).opacity);
  const rings=new Map<HTMLElement,HTMLElement>();
  let results:Result[]=[],active=-1,total=0,revision=0,timer=0,composing=false,compositionEnding=false,busy=false,committedQuery='',committedBadges=0;
  const pause=()=>new Promise<void>(resolve=>window.setTimeout(resolve,0));

  interface Badge {key:string;text:string;colorLabel:string;ink:string;background:string;cards:Set<HTMLElement>}
  const badgeFilter=document.querySelector<HTMLElement>('.sce-badge-filter')!;
  const badgePopup=document.querySelector<HTMLElement>('.sce-badge-popup')!;
  const badgeChips=badgeFilter.querySelector<HTMLElement>('.sce-badge-chips')!;
  const badgeMore=badgeFilter.querySelector<HTMLButtonElement>('.sce-badge-more')!;
  const badgeReset=badgeFilter.querySelector<HTMLButtonElement>('.sce-badge-reset')!;
  const badgeMode=badgeFilter.querySelector<HTMLSelectElement>('.sce-badge-mode')!;
  const badgeFind=badgePopup.querySelector<HTMLInputElement>('.sce-badge-find')!;
  const badgeList=badgePopup.querySelector<HTMLElement>('.sce-badge-list')!;
  const selectedBadges=new Set<string>(),cardBadges=new Map<HTMLElement,Map<string,HTMLElement>>();
  const badgeButtons=new Map<string,HTMLButtonElement[]>(),automaticDetails=new WeakSet<HTMLDetailsElement>();
  const themeColors=['red','orange','yellow','green','cyan','blue','purple','pink'];

  function badgeIdentity(el:HTMLElement):{key:string;text:string;colorLabel:string} {
    const text=el.textContent?.trim()??'';
    let kind=el.dataset.sceBadgeColorKind??'',color=el.dataset.sceBadgeColor??'';
    if(!(kind==='theme'&&themeColors.includes(color))&&!(kind==='custom'&&/^#[a-f0-9]{6}$/.test(color))){
      const theme=themeColors.find(c=>el.classList.contains(`badge-${c}`));
      let custom=el.style.getPropertyValue('--simple-badge-color').trim().toLowerCase();
      if(/^#[a-f0-9]{3}$/.test(custom))custom='#'+Array.from(custom.slice(1),c=>c+c).join('');
      if(el.classList.contains('badge-custom')&&/^#[a-f0-9]{6}$/.test(custom)){kind='custom';color=custom;}
      else if(theme&&!el.classList.contains('badge-custom')){kind='theme';color=theme;}
      else {kind='rendered';color=getComputedStyle(el).color;}
    }
    const colorLabel=kind==='theme'?badgeFilter.dataset.colors!.split(',')[themeColors.indexOf(color)]:kind==='custom'?color:`${badgeFilter.dataset.rendered} ${color}`;
    return {key:JSON.stringify([text,kind,color]),text,colorLabel};
  }
  function eligibleBadge(el:HTMLElement,root:HTMLElement):boolean {
    if(!el.textContent?.trim())return false;
    for(let parent:HTMLElement|null=el;parent;parent=parent.parentElement){
      if(parent.matches('pre,code,script,style,[hidden],[aria-hidden="true"],.sce-placeholder,.sce-resource-placeholder'))return false;
      const style=getComputedStyle(parent);
      if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)return false;
      if(parent===root)return true;
    }
    return false;
  }
  function closeBadgePopup(focus=false):void {
    badgePopup.hidden=true;badgeMore.setAttribute('aria-expanded','false');
    if(focus)badgeMore.focus({preventScroll:true});
  }
  function positionBadgePopup():void {
    const top=Math.min(badgeFilter.getBoundingClientRect().bottom+4,Math.max(12,innerHeight-260));
    badgePopup.style.top=`${top}px`;badgePopup.style.maxHeight=`${innerHeight-top-12}px`;
  }
  function updateBadgeControls():void {
    for(const [key,controls] of badgeButtons)for(const control of controls)control.setAttribute('aria-pressed',String(selectedBadges.has(key)));
    badgeFilter.querySelector<HTMLOutputElement>('.sce-badge-selected')!.textContent=format(badgeFilter.dataset.selected!,{count:selectedBadges.size});
    badgeReset.disabled=!selectedBadges.size;
    badgeMode.style.visibility=selectedBadges.size<2?'hidden':'visible';badgeMode.disabled=selectedBadges.size<2;
  }
  function compactBadgeChips():void {
    // Measure the real wrapping width, including touch-sized controls. Never exceed two rows.
    const chips=Array.from(badgeChips.children) as HTMLElement[];
    for(const chip of chips)chip.hidden=false;
    let row=-1,rows=0;
    for(const chip of chips){if(chip.offsetTop!==row){row=chip.offsetTop;rows++;}chip.hidden=rows>2;}
  }
  function setupBadges():void {
    const catalog=new Map<string,Badge>();
    for(const card of allCards){
      if(card.dataset.nodeType!=='text')continue;
      const root=card.querySelector<HTMLElement>('.sce-card-scroll')!,found=new Map<string,HTMLElement>();
      for(const el of root.querySelectorAll<HTMLElement>('span.badge')){
        if(!eligibleBadge(el,root))continue;
        const identity=badgeIdentity(el);if(found.has(identity.key))continue;
        found.set(identity.key,el);
        let badge=catalog.get(identity.key);
        if(!badge){const style=getComputedStyle(el);badge={...identity,ink:style.color,background:style.backgroundColor,cards:new Set()};catalog.set(identity.key,badge);}
        badge.cards.add(card);
      }
      cardBadges.set(card,found);
    }
    if(!catalog.size)return;
    for(const [i,badge] of [...catalog.values()].sort((a,b)=>b.cards.size-a.cards.size).entries()){
      const controls:HTMLButtonElement[]=[];
      for(const container of [badgeChips,badgeList]){
        const button=document.createElement('button');button.type='button';button.className='sce-badge-chip';button.dataset.badgeIndex=String(i);
        button.style.setProperty('--sce-badge-ink',badge.ink);button.style.setProperty('--sce-badge-bg',badge.background);
        button.title=`${badge.text} · ${badge.colorLabel} · ${format(badgeFilter.dataset.cards!,{cards:badge.cards.size})}`;
        button.setAttribute('aria-label',button.title);
        const check=document.createElement('span');check.className='sce-badge-check';check.textContent='✓';check.setAttribute('aria-hidden','true');
        const label=document.createElement('span');label.className='sce-badge-name';label.textContent=badge.text;
        const count=document.createElement('span');count.className='sce-badge-count';count.textContent=String(badge.cards.size);
        button.append(check,label,count);container.appendChild(button);controls.push(button);
        button.addEventListener('click',()=>{
          if(selectedBadges.has(badge.key))selectedBadges.delete(badge.key);else selectedBadges.add(badge.key);
          if(!selectedBadges.size)badgeMode.value='any';updateBadgeControls();schedule();
        });
      }
      badgeButtons.set(badge.key,controls);
    }
    badgeFilter.hidden=false;badgeMore.textContent=format(badgeFilter.dataset.all!,{count:catalog.size});updateBadgeControls();compactBadgeChips();
    let lastWidth=badgeChips.clientWidth;
    new ResizeObserver(()=>{if(badgeChips.clientWidth!==lastWidth){lastWidth=badgeChips.clientWidth;compactBadgeChips();}}).observe(badgeChips);
    badgeMode.addEventListener('change',schedule);
    badgeReset.addEventListener('click',()=>{selectedBadges.clear();badgeMode.value='any';updateBadgeControls();schedule();});
    badgeMore.addEventListener('click',()=>{
      if(!badgePopup.hidden){closeBadgePopup();return;}
      badgePopup.hidden=false;badgeMore.setAttribute('aria-expanded','true');positionBadgePopup();badgeFind.focus({preventScroll:true});
    });
    badgePopup.querySelector('.sce-badge-close')!.addEventListener('click',()=>closeBadgePopup(true));
    badgeFind.addEventListener('input',()=>{
      const term=badgeFind.value.trim().toLowerCase();let count=0;
      for(const button of badgeList.querySelectorAll<HTMLButtonElement>('.sce-badge-chip')){button.hidden=!button.querySelector('.sce-badge-name')!.textContent.toLowerCase().includes(term);if(!button.hidden)count++;}
      badgePopup.querySelector<HTMLElement>('.sce-badge-empty')!.hidden=count>0;
    });
    document.addEventListener('pointerdown',event=>{if(!badgePopup.hidden&&!badgePopup.contains(event.target as Node)&&!badgeMore.contains(event.target as Node))closeBadgePopup();});
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!event.isComposing&&!badgePopup.hidden){event.preventDefault();event.stopPropagation();closeBadgePopup(true);}
    },true);
    document.addEventListener('focusin',event=>{if(!badgePopup.hidden&&!badgePopup.contains(event.target as Node)&&event.target!==badgeMore)closeBadgePopup();});
    window.addEventListener('resize',()=>{if(!badgePopup.hidden)positionBadgePopup();});
  }
  function badgeRange(root:HTMLElement,source=false):Range|undefined {
    const badge=Array.from(root.querySelectorAll<HTMLElement>('span.badge')).find(el=>eligibleBadge(el,root)&&selectedBadges.has(badgeIdentity(el).key));
    if(!badge)return;
    let opened=false;
    for(let el:HTMLElement|null=badge.parentElement;el&&root.contains(el);el=el.parentElement){
      if(el instanceof HTMLDetailsElement&&!el.open){if(source)automaticDetails.add(el);el.open=true;opened=true;}
    }
    if(opened&&source)index=buildIndex();
    const range=document.createRange();range.selectNodeContents(badge);return range;
  }

  function normalize(raw:string):Normalized {
    const lower=raw.toLowerCase(),text=lower.replace(/\s+/gu,' ');
    if(lower.length===raw.length&&text.length===lower.length)return {text};
    // Most text needs no mapping. Expanded case folds and collapsed whitespace do.
    const lowerStarts:number[]=[],lowerEnds:number[]=[];
    let source=0;
    for(const character of raw){
      for(let i=0;i<character.toLowerCase().length;i++){lowerStarts.push(source);lowerEnds.push(source+character.length);}
      source+=character.length;
    }
    const starts:number[]=[],ends:number[]=[];
    for(let i=0;i<lower.length;){
      const start=i++;
      if(/\s/u.test(lower[start]))while(i<lower.length&&/\s/u.test(lower[i]))i++;
      starts.push(lowerStarts[start]);ends.push(lowerEnds[i-1]);
    }
    return {text,starts:Uint32Array.from(starts),ends:Uint32Array.from(ends)};
  }
  const query=()=>normalize(input.value.trim()).text;

  function readText(root:HTMLElement,includeFallback=false):TextIndex {
      const segments:Segment[]=[],chunks:string[]=[];
      let length=0,lastSpace=true;
      const separate=()=>{if(!lastSpace){chunks.push(' ');length++;lastSpace=true;}};
      function visit(node:Node):void {
        if(node.nodeType===Node.TEXT_NODE){
          const part=normalize(node.textContent??''),skip=lastSpace&&part.text.startsWith(' ')?1:0;
          const value=part.text.slice(skip);if(!value)return;
          segments.push({...part,node:node as Text,start:length,end:length+value.length,skip});
          chunks.push(value);length+=value.length;lastSpace=value.endsWith(' ');return;
        }
        if(!(node instanceof Element))return;
        if(node.matches('script,style,title,desc,defs,[hidden],[aria-hidden="true"],.sce-resource-placeholder')||(!includeFallback&&node.matches('.sce-placeholder'))){separate();return;}
        const style=getComputedStyle(node);
        if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0){separate();return;}
        const block=!style.display.startsWith('inline')&&style.display!=='contents';
        if(block||node.tagName==='BR'||node.tagName==='HR')separate();
        const children=node instanceof HTMLDetailsElement&&!node.open?Array.from(node.children).filter(e=>e.tagName==='SUMMARY'):Array.from(node.childNodes);
        for(const child of children)visit(child);
        if(block)separate();
      }
      visit(root);
      return {text:chunks.join(''),segments};
  }
  async function buildIndex():Promise<CardIndex[]> {
    const cards:CardIndex[]=[];let lastYield=performance.now();
    for(const el of allCards){
      if(el.dataset.nodeType!=='text')continue;
      const scroll=el.querySelector<HTMLElement>('.sce-card-scroll')!;
      cards.push({el,scroll,...readText(scroll),left:parseFloat(el.style.left),top:parseFloat(el.style.top),width:parseFloat(el.style.width),height:parseFloat(el.style.height)});
      if(performance.now()-lastYield>8){await pause();lastYield=performance.now();}
    }
    return cards.sort((a,b)=>a.top-b.top||a.left-b.left);
  }
  let index=buildIndex();

  function rangeFor(card:TextIndex,start:number,end:number):Range {
    function segmentAt(offset:number):Segment {
      let lo=0,hi=card.segments.length-1;
      while(lo<hi){const mid=(lo+hi)>>1;if(card.segments[mid].end<=offset)lo=mid+1;else hi=mid;}
      return card.segments[lo];
    }
    const a=segmentAt(start),b=segmentAt(end-1),ai=start-a.start+a.skip,bi=end-1-b.start+b.skip;
    const range=document.createRange();
    range.setStart(a.node,a.starts?.[ai]??ai);range.setEnd(b.node,b.ends?.[bi]??bi+1);return range;
  }
  function format(template:string,values:Record<string,number>):string {
    return template.replace(/\{(cards|hits|index|count)\}/g,(_,key:string)=>String(values[key]));
  }
  function report():void {
    const template=committedBadges?(committedQuery?badgeFilter.dataset.combined!:badgeFilter.dataset.results!):search.dataset.results!;
    status.textContent=!committedQuery&&!committedBadges?search.dataset.idle!:!results.length?(committedBadges?badgeFilter.dataset.empty!:search.dataset.empty!):
      format(template,{cards:results.length,hits:total})+(active>=0?` · ${format(search.dataset.current!,{index:active+1,cards:results.length})}`:'');
  }
  function setBusy(value:boolean):void {
    busy=value;search.setAttribute('aria-busy',String(value));
    for(const button of buttons)if(button.dataset.searchAction!=='clear')button.disabled=value||!results.length;
    if(value)status.textContent=search.dataset.working!;
  }
  function decorate():void {
    const matched=new Set(results.map(r=>r.card.el.dataset.nodeId)),fading=dim.checked&&results.length>0;
    const excluded=reader?.querySelector<HTMLElement>('.sce-reader-excluded');
    if(excluded)excluded.hidden=!reading||(!committedQuery&&!committedBadges)||matched.has(reading.dataset.nodeId);
    for(const el of allCards){
      el.classList.toggle('sce-search-match',matched.has(el.dataset.nodeId));
      el.classList.toggle('sce-search-dim',fading&&!matched.has(el.dataset.nodeId));
      el.removeAttribute('aria-current');
    }
    for(const edge of edges){
      const count=Number(matched.has(edge.dataset.fromNode))+Number(matched.has(edge.dataset.toNode));
      edge.classList.toggle('sce-search-edge-faint',fading&&count===0);
      edge.classList.toggle('sce-search-edge-related',fading&&count===1);
    }
    const visible=new Set(results.map(r=>r.card.el));
    for(const [el,ring] of rings)if(!visible.has(el)){ring.remove();rings.delete(el);}
    for(const [i,{card}] of results.entries()){
      let ring=rings.get(card.el);
      if(!ring){
        ring=document.createElement('div');ring.className='sce-search-ring';ring.setAttribute('aria-hidden','true');
        ring.style.left=card.el.style.left;ring.style.top=card.el.style.top;ring.style.width=card.el.style.width;ring.style.height=card.el.style.height;
        ring.style.zIndex=card.el.style.zIndex;ring.style.borderRadius=getComputedStyle(card.el).borderRadius;
        ring.dataset.current=currentLabel;scene.appendChild(ring);rings.set(card.el,ring);
      }
      ring.classList.toggle('sce-search-current',i===active);
      ring.classList.toggle('sce-reader-current-source',card.el===reading);
      if(i===active)card.el.setAttribute('aria-current','true');
    }
  }
  function clear():void {
    input.value='';schedule();
  }
  async function runSearch(version:number):Promise<boolean> {
    const term=query(),selection=new Set(selectedBadges),every=badgeMode.value==='all';
    setBusy(true);
    try {
      const cards=await index;if(version!==revision)return false;
      const found:Result[]=[];let count=0,lastYield=performance.now();
      const highlight=registry?new Highlight():undefined;
      for(const card of cards){
        const badges=cardBadges.get(card.el);
        if(selection.size&&!(every?[...selection].every(key=>badges?.has(key)):[...selection].some(key=>badges?.has(key))))continue;
        const offsets:number[]=[];let from=0,at:number;
        while(term&&(at=card.text.indexOf(term,from))!==-1){
          offsets.push(at);count++;from=at+term.length;
          highlight?.add(rangeFor(card,at,from));
          if(count%100===0&&performance.now()-lastYield>8){await pause();if(version!==revision)return false;lastYield=performance.now();}
        }
        if(offsets.length||(!term&&selection.size))found.push({card,offsets});
        if(performance.now()-lastYield>8){await pause();if(version!==revision)return false;lastYield=performance.now();}
      }
      if(version!==revision)return false;
      committedQuery=term;committedBadges=selection.size;results=found;active=-1;total=count;
      if(highlight)registry!.set('sce-search',highlight);
      decorate();setBusy(false);report();updateReaderHighlights();return true;
    } catch {
      if(version===revision){registry?.delete('sce-search');results=[];active=-1;total=0;committedQuery='';committedBadges=0;decorate();setBusy(false);updateReaderHighlights();status.textContent=search.dataset.failed!;}
      return false;
    }
  }
  function schedule():void {
    window.clearTimeout(timer);const version=++revision;
    if(!query()&&!selectedBadges.size){
      committedQuery='';committedBadges=0;results=[];active=-1;total=0;
      registry?.delete('sce-search');decorate();setBusy(false);report();updateReaderHighlights();return;
    }
    setBusy(true);timer=window.setTimeout(()=>{void runSearch(version);},120);
  }
  function reveal(scroll:HTMLElement,range:Range,factor=scale):void {
    // Scroll only the card and nested code/table containers, never the page/scene.
    let el=range.startContainer.parentElement;
    while(el&&scroll.contains(el)){
      const style=getComputedStyle(el),bounds=el.getBoundingClientRect(),rect=range.getClientRects()[0];
      if(!rect)break;
      const left=bounds.left+el.clientLeft*factor,top=bounds.top+el.clientTop*factor;
      if(/auto|scroll/.test(style.overflowY)&&el.scrollHeight>el.clientHeight){
        if(rect.top<top||rect.bottom>top+el.clientHeight*factor)el.scrollTop+=(rect.top-top)/factor-Math.min(24,el.clientHeight/4);
      }
      if(/auto|scroll/.test(style.overflowX)&&el.scrollWidth>el.clientWidth){
        if(rect.left<left||rect.right>left+el.clientWidth*factor)el.scrollLeft+=(rect.left-left)/factor-Math.min(16,el.clientWidth/4);
      }
      if(el===scroll)break;el=el.parentElement;
    }
  }
  async function navigate(action:string):Promise<void> {
    if(composing)return;
    window.clearTimeout(timer);
    if(busy||query()!==committedQuery){const version=++revision;if(!await runSearch(version)||version!==revision)return;}
    if(!results.length)return;
    syncViewport();
    if(action==='all'){
      const left=Math.min(...results.map(r=>r.card.left)),top=Math.min(...results.map(r=>r.card.top));
      const right=Math.max(...results.map(r=>r.card.left+r.card.width)),bottom=Math.max(...results.map(r=>r.card.top+r.card.height));
      scale=Math.max(.01,Math.min(1,(viewport.clientWidth-64)/(right-left),(viewport.clientHeight-64)/(bottom-top)));
      x=(viewport.clientWidth-(right-left)*scale)/2-left*scale;y=(viewport.clientHeight-(bottom-top)*scale)/2-top*scale;paint();return;
    }
    const delta=action==='previous'?-1:1;
    active=active<0?(delta>0?0:results.length-1):(active+delta+results.length)%results.length;
    const {card,offsets}=results[active];
    // Keep readable zoom; a very large card is centered on the actual hit below.
    const readingScale=Math.min(1,Math.max(.75,Math.min((viewport.clientWidth-64)/card.width,(viewport.clientHeight-64)/card.height)));
    if(scale<readingScale)scale=readingScale;
    const onScreen=x+card.left*scale>=24&&y+card.top*scale>=24&&x+(card.left+card.width)*scale<=viewport.clientWidth-24&&y+(card.top+card.height)*scale<=viewport.clientHeight-24;
    if(!onScreen){x=viewport.clientWidth/2-(card.left+card.width/2)*scale;y=viewport.clientHeight/2-(card.top+card.height/2)*scale;}
    paint();
    const range=committedQuery?rangeFor(card,offsets[0],offsets[0]+committedQuery.length):badgeRange(card.scroll,true);
    if(range)reveal(card.scroll,range);
    const rect=range?.getClientRects()[0],vp=viewport.getBoundingClientRect();
    if(rect){
      if(rect.left<vp.left+24||rect.right>vp.right-24)x+=vp.left+Math.min(viewport.clientWidth/2,64)-rect.left;
      if(rect.top<vp.top+24||rect.bottom>vp.bottom-24)y+=vp.top+Math.min(viewport.clientHeight/2,64)-rect.top;
    }
    paint();decorate();report();
    if(reading)openReader(card.el,false,true);
  }
  // Reader content is a single independent copy; it never joins allCards or index.
  const readerBody=reader?.querySelector<HTMLElement>('.sce-reader-body');
  const readerClose=reader?.querySelector<HTMLButtonElement>('.sce-reader-close');
  const readerTriggers=new Map<HTMLElement,{button:HTMLButtonElement;label:HTMLElement}>();
  const narrow=matchMedia('(max-width:899px)');
  let reading:HTMLElement|undefined,readerText:TextIndex|undefined,readerFont=16,copyNumber=0;

  function layoutReader():void {
    const covered=!!reading&&narrow.matches;
    viewport.inert=covered;
    if(covered)viewport.setAttribute('aria-hidden','true');else viewport.removeAttribute('aria-hidden');
    syncViewport();paint();
  }
  narrow.addEventListener('change',layoutReader);

  function updateReaderHighlights():Range|undefined {
    registry?.delete('sce-reader-search');
    if(!reading||!readerText||!committedQuery)return;
    const highlight=registry?new Highlight():undefined;
    let from=0,at:number,first:Range|undefined;
    while((at=readerText.text.indexOf(committedQuery,from))!==-1){
      from=at+committedQuery.length;
      const range=rangeFor(readerText,at,from);first??=range;highlight?.add(range);
    }
    if(highlight)registry!.set('sce-reader-search',highlight);
    return first;
  }

  function copyReaderContent(source:HTMLElement):HTMLElement {
    const clone=source.cloneNode(true) as HTMLElement;
    const originals=[source,...source.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
    const base=parseFloat(getComputedStyle(source).fontSize)||16,ids=new Map<string,string>();
    const prefix=`sce-reader-${++copyNumber}-`;
    // Measure frozen source typography before writing the copy, including hidden details.
    const typography=originals.map(el=>{
      const style=getComputedStyle(el),size=parseFloat(style.fontSize)||base;
      const special=el.closest('h1,h2,h3,h4,h5,h6,pre,code,.badge,sub,sup');
      return {ratio:size/base,line:special?(parseFloat(style.lineHeight)/size||1.4):1.65};
    });
    for(const [i,el] of copies.entries()){
      if(el.id){ids.set(el.id,`${prefix}${i}`);el.id=`${prefix}${i}`;}
      el.removeAttribute('data-node-id');
      el.classList.remove('sce-card','sce-card-scroll','sce-placeholder');
      if(el instanceof HTMLElement){
        el.style.fontSize=`calc(var(--sce-reader-font,16px) * ${typography[i].ratio})`;
        el.style.lineHeight=String(typography[i].line);
      }
    }
    for(const el of copies){
      for(const attribute of Array.from(el.attributes)){
        let value=attribute.value;
        if(['aria-labelledby','aria-describedby','aria-controls','aria-owns','headers','for'].includes(attribute.name))value=value.split(/\s+/).map(id=>ids.get(id)??id).join(' ');
        if(['href','xlink:href'].includes(attribute.name)&&value.startsWith('#'))value=`#${ids.get(value.slice(1))??value.slice(1)}`;
        value=value.replace(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g,(_,id:string)=>`url(#${ids.get(id)??id})`);
        if(value!==attribute.value)el.setAttribute(attribute.name,value);
      }
    }
    clone.classList.add('sce-reader-content');
    clone.removeAttribute('tabindex');clone.removeAttribute('role');clone.removeAttribute('aria-label');
    // A fallback scroll container can contain Canvas spacers; omit them from reading.
    for(const child of Array.from(clone.children))if(child.getAttribute('aria-hidden')==='true')child.remove();
    for(const property of ['width','height','min-height','max-height','min-width','max-width','flex','margin','padding','overflow'])clone.style.removeProperty(property);
    for(const table of Array.from(clone.querySelectorAll('table'))){
      const wrap=document.createElement('div');wrap.className='sce-reader-table';wrap.tabIndex=0;
      table.before(wrap);wrap.appendChild(table);
    }
    for(const pre of clone.querySelectorAll('pre'))pre.tabIndex=0;
    return clone;
  }

  function openReader(card:HTMLElement,focus=true,searchNavigation=false):void {
    if(!reader||!readerBody||!readerTriggers.has(card))return;
    if(reading===card&&!searchNavigation){if(focus)readerClose!.focus({preventScroll:true});return;}
    const switched=reading!==card;
    if(switched){
      reading?.classList.remove('sce-reading');
      if(reading)readerTriggers.get(reading)!.label.hidden=true;
      reading=card;card.classList.add('sce-reading');readerTriggers.get(card)!.label.hidden=false;
      reader.dataset.source=card.dataset.nodeId;
      registry?.delete('sce-reader-search');readerText=undefined;
      const source=card.querySelector<HTMLElement>('.sce-render-sizer')??card.querySelector<HTMLElement>('.sce-card-scroll')!;
      readerBody.replaceChildren(copyReaderContent(source));readerBody.scrollTop=0;readerBody.scrollLeft=0;
    }
    reader.hidden=false;document.body.classList.add('sce-reader-open');layoutReader();
    if(switched)readerText=readText(readerBody,true);
    const first=searchNavigation&&!committedQuery?badgeRange(readerBody):updateReaderHighlights();
    if(searchNavigation&&!committedQuery){readerText=readText(readerBody,true);updateReaderHighlights();}
    if(first)reveal(readerBody,first,1);
    decorate();
    reader.querySelector<HTMLElement>('.sce-reader-status')!.textContent=`${reader.dataset.changedLabel} ${card.querySelector('.sce-card-scroll')?.getAttribute('aria-label')??''}`;
    if(focus)readerClose!.focus({preventScroll:true});
  }

  function closeReader():void {
    if(!reading||!reader||!readerBody)return;
    const previous=reading,trigger=readerTriggers.get(previous);
    reading.classList.remove('sce-reading');if(trigger)trigger.label.hidden=true;reading=undefined;
    registry?.delete('sce-reader-search');readerText=undefined;readerBody.replaceChildren();
    reader.hidden=true;delete reader.dataset.source;document.body.classList.remove('sce-reader-open');
    layoutReader();decorate();
    (trigger?.button.isConnected?trigger.button:viewport).focus({preventScroll:true});
  }

  if(reader&&readerBody){
    for(const card of allCards){
      if(card.dataset.nodeType!=='text')continue;
      const source=card.querySelector<HTMLElement>('.sce-render-sizer')??card.querySelector<HTMLElement>('.sce-card-scroll');
      if(!source||(!source.textContent?.trim()&&!source.querySelector('img,svg')))continue;
      const anchor=document.createElement('div');anchor.className='sce-reader-anchor';anchor.dataset.readerNode=card.dataset.nodeId;
      for(const property of ['left','top','width','height','z-index'])anchor.style.setProperty(property,card.style.getPropertyValue(property));
      const button=document.createElement('button');button.type='button';button.className='sce-reader-trigger';
      button.title=reader.dataset.openLabel!;button.setAttribute('aria-label',reader.dataset.openLabel!);
      button.setAttribute('aria-controls','sce-reader');
      const symbol=document.createElement('span');symbol.className='sce-reader-trigger-symbol';symbol.textContent='▤';symbol.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.className='sce-reader-trigger-text';label.textContent=reader.dataset.openLabel!;
      const current=document.createElement('span');current.className='sce-reader-source-label';current.textContent=reader.dataset.currentLabel!;current.hidden=true;current.setAttribute('aria-hidden','true');
      button.append(symbol,label);anchor.append(current,button);card.after(anchor);
      readerTriggers.set(card,{button,label:current});
      button.addEventListener('click',()=>openReader(card));
    }
    readerClose!.addEventListener('click',closeReader);
    for(const button of reader.querySelectorAll<HTMLButtonElement>('[data-reader-font]'))button.addEventListener('click',()=>{
      const bounds=readerBody.getBoundingClientRect();
      const anchor=Array.from(readerBody.querySelectorAll<HTMLElement>('p,li,pre,h1,h2,h3,h4,h5,h6,blockquote,summary')).find(el=>{const r=el.getBoundingClientRect();return r.height>0&&r.bottom>bounds.top+24;});
      const offset=anchor?.getBoundingClientRect().top;
      readerFont=Math.max(14,Math.min(22,readerFont+Number(button.dataset.readerFont)));
      reader.style.setProperty('--sce-reader-font',`${readerFont}px`);
      reader.querySelector<HTMLOutputElement>('.sce-reader-font')!.textContent=`${readerFont}px`;
      for(const control of reader.querySelectorAll<HTMLButtonElement>('[data-reader-font]'))control.disabled=Number(control.dataset.readerFont)<0?readerFont===14:readerFont===22;
      if(anchor&&offset!==undefined)readerBody.scrollTop+=anchor.getBoundingClientRect().top-offset;
    });
    readerBody.addEventListener('toggle',event=>{
      if(event.target instanceof HTMLDetailsElement&&reading){readerText=readText(readerBody,true);updateReaderHighlights();}
    },true);
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||event.isComposing||event.defaultPrevented||!reading)return;
      if((event.target as Element).closest('input,textarea,select,[contenteditable="true"]'))return;
      event.preventDefault();closeReader();
    });
  }

  input.addEventListener('compositionstart',()=>{composing=true;revision++;window.clearTimeout(timer);});
  input.addEventListener('compositionend',()=>{
    composing=false;compositionEnding=true;window.setTimeout(()=>{compositionEnding=false;},0);schedule();
  });
  input.addEventListener('input',()=>{if(!composing)schedule();});
  search.addEventListener('keydown',event=>{
    // Do not treat an Enter delivered in the same turn as compositionend as navigation.
    if(composing||compositionEnding||event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();clear();input.focus();}
    else if(event.key==='Enter'&&event.target===input){event.preventDefault();void navigate(event.shiftKey?'previous':'next');}
  });
  for(const button of buttons)button.addEventListener('click',()=>{
    if(button.dataset.searchAction==='clear')clear();else void navigate(button.dataset.searchAction!);
    input.focus();
  });
  dim.addEventListener('change',decorate);
  scene.addEventListener('toggle',event=>{
    if(event.target instanceof HTMLDetailsElement){
      if(automaticDetails.has(event.target)){automaticDetails.delete(event.target);return;}
      index=buildIndex();schedule();
    }
  },true);
  setupBadges();
  layoutToolbar();new ResizeObserver(layoutToolbar).observe(toolbar);
  viewport.classList.add('sce-interactive');fit();
  new ResizeObserver(()=>{syncViewport();paint();}).observe(viewport);
  // Observe rejected indexing even if the user never starts a search.
  void index.catch(()=>{status.textContent=search.dataset.failed!;});
}
