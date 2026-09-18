import { type App } from 'obsidian';
import { snapshot } from '../src/runtime';
import { exportCanvas } from '../src/export';
import { EN } from '../src/i18n';
import { computed } from '../src/styles';

// Local QA entry only. Never included in the production bundle.
export async function runGroupQA(app:App):Promise<void> {
  const base=`${app.vault.configDir}/plugins/simple-canvas-exporter`;
  try {
    const leaf=app.workspace.getLeavesOfType('canvas').find(l=>(l.view as unknown as {file?:{path:string}}).file?.path==='example-canvas.canvas');
    if(!leaf)throw Error('Open example-canvas.canvas to run group QA.');
    const snap=snapshot(leaf.view);
    // Obsidian attaches plugin CSS after onload returns.
    await new Promise<void>(resolve=>snap.document.defaultView!.setTimeout(resolve,500));
    const stage=snap.document.defaultView!.createDiv({cls:'canvas sce-staging'});
    (snap.native?.wrapperEl??snap.document.body).appendChild(stage);
    const reference=[];
    try {
      for(const n of snap.data.nodes.filter(n=>n.type==='group')){
        const source=snap.native?.nodes?.get(n.id)?.nodeEl;
        if(!source)throw Error(`Missing native group ${n.id}`);
        const copy=source.cloneNode(true) as HTMLElement;
        copy.classList.add('sce-render-node');copy.classList.remove('is-selected','is-focused','is-editing','is-dragging');
        for(const prop of ['position','transform','width','height'])copy.style.removeProperty(prop);
        copy.style.setProperty('--canvas-node-width',`${n.width}px`);copy.style.setProperty('--canvas-node-height',`${n.height}px`);
        stage.appendChild(copy);
        const describe=(el:Element)=>{
          const r=el.getBoundingClientRect();
          return {tag:el.tagName,cls:el.getAttribute('class'),rect:{x:r.x,y:r.y,width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom},style:Object.fromEntries(Array.from(computed(el),k=>[k,computed(el).getPropertyValue(k)]))};
        };
        reference.push({node:n,sourceHTML:source.outerHTML,stagedHTML:copy.outerHTML,elements:[copy,...copy.querySelectorAll('*')].map(describe)});
        copy.remove();
      }
    }finally{stage.remove();}
    await app.vault.adapter.write(`${base}/qa-groups-native.json`,JSON.stringify(reference,null,2));
    await app.vault.adapter.write(`${base}/qa-groups-canvas.json`,JSON.stringify(snap.data,null,2));
    const result=await exportCanvas(app,snap,EN,new AbortController().signal);
    await app.vault.adapter.write(`${base}/qa-groups.html`,result.html);
    await app.vault.adapter.write(`${base}/qa-groups-result.json`,JSON.stringify({...result,html:undefined},null,2));
    const variants=[
      {id:'inner',type:'group',x:50,y:60,width:300,height:200,label:'nested'},
      {id:'text',type:'text',x:100,y:120,width:180,height:90,text:'Visible needle card'},
      {id:'outer',type:'group',x:0,y:0,width:450,height:340,label:'outer'},
      ...['1','2','3','4','5','6','#159d89'].map((color,i)=>({id:`color-${i}`,type:'group',x:500+i*280,y:0,width:250,height:340,color,label:i===6?'<img src=x onerror="globalThis.injected=1"> & 中文':`Color ${color}`})),
      {id:'empty',type:'group',x:0,y:450,width:250,height:100},
      {id:'long',type:'group',x:500,y:450,width:120,height:100,label:'Long label '.repeat(30)},
    ];
    const extra=await exportCanvas(app,{...snap,native:snap.native?{...snap.native,nodes:new Map(),edges:new Map()}:undefined,data:{nodes:variants,edges:[{id:'group-edge',fromNode:'outer',toNode:'color-0',fromSide:'right',toSide:'left',fromEnd:'none',toEnd:'arrow'}],warnings:[]}},EN,new AbortController().signal);
    await app.vault.adapter.write(`${base}/qa-groups-fallback.html`,extra.html);
    await app.vault.adapter.write(`${base}/qa-groups-fallback-result.json`,JSON.stringify({...extra,html:undefined},null,2));
    const only=await exportCanvas(app,{...snap,data:{nodes:[variants[0]],edges:[],warnings:[]}},EN,new AbortController().signal);
    await app.vault.adapter.write(`${base}/qa-groups-only.html`,only.html);
  }catch(error){await app.vault.adapter.write(`${base}/qa-groups-error.json`,JSON.stringify({error:String(error),stack:(error as Error).stack},null,2));}
}
