/** Serialized into the exported document. Keep this function self-contained. */
export function startViewer():void {
  const viewport=document.querySelector<HTMLElement>('.sce-viewport')!;
  const scene=document.querySelector<HTMLElement>('.sce-scene')!;
  const zoomLabel=document.querySelector<HTMLElement>('.sce-zoom')!;
  const width=Number(scene.dataset.width),height=Number(scene.dataset.height);
  let scale=1,x=0,y=0,drag:{id:number;x:number;y:number;startX:number;startY:number}|undefined;
  function paint():void {
    scene.style.transform=`translate(${x}px,${y}px) scale(${scale})`;
    scene.dataset.zoom=String(scale);scene.dataset.panX=String(x);scene.dataset.panY=String(y);
    zoomLabel.textContent=`${Math.round(scale*100)}%`;
  }
  function fit():void {scale=Math.max(.01,Math.min(1,(viewport.clientWidth-48)/width,(viewport.clientHeight-48)/height));x=(viewport.clientWidth-width*scale)/2;y=(viewport.clientHeight-height*scale)/2;paint();}
  function zoom(next:number,px=viewport.clientWidth/2,py=viewport.clientHeight/2):void {
    next=Math.max(.01,Math.min(4,next));const ratio=next/scale;x=px-(px-x)*ratio;y=py-(py-y)*ratio;scale=next;paint();
  }
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-action]'))button.addEventListener('click',()=>{
    const action=button.dataset.action;
    if(action==='fit')fit();else if(action==='reset')zoom(1);else zoom(scale*(action==='in'?1.2:1/1.2));
  });
  viewport.addEventListener('wheel',event=>{
    if(event.ctrlKey||event.metaKey){event.preventDefault();const r=viewport.getBoundingClientRect();zoom(scale*Math.exp(-event.deltaY*.003),event.clientX-r.left,event.clientY-r.top);return;}
    if((event.target as Element).closest('.sce-card-scroll'))return;
    event.preventDefault();const unit=event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1;
    x-=event.deltaX*unit;y-=event.deltaY*unit;paint();
  },{passive:false});
  viewport.addEventListener('pointerdown',event=>{
    if(event.button!==0||(event.target as Element).closest('.sce-card'))return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:x,startY:y};viewport.setPointerCapture(event.pointerId);viewport.classList.add('sce-dragging');
  });
  viewport.addEventListener('pointermove',event=>{if(drag?.id===event.pointerId){x=drag.startX+event.clientX-drag.x;y=drag.startY+event.clientY-drag.y;paint();}});
  const end=()=>{drag=undefined;viewport.classList.remove('sce-dragging');};
  viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);viewport.addEventListener('lostpointercapture',end);
  viewport.addEventListener('keydown',event=>{
    if((event.target as Element).closest('.sce-card'))return;
    if(event.key==='0'){zoom(1);event.preventDefault();}else if(event.key==='1'){fit();event.preventDefault();}
    else if(event.key==='+'||event.key==='='){zoom(scale*1.2);event.preventDefault();}else if(event.key==='-'){zoom(scale/1.2);event.preventDefault();}
  });
  viewport.classList.add('sce-interactive');fit();
  let oldWidth=viewport.clientWidth,oldHeight=viewport.clientHeight;
  new ResizeObserver(()=>{x+=(viewport.clientWidth-oldWidth)/2;y+=(viewport.clientHeight-oldHeight)/2;oldWidth=viewport.clientWidth;oldHeight=viewport.clientHeight;paint();}).observe(viewport);
}
