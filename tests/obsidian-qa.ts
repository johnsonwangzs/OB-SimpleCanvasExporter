import { TextFileView, type App } from 'obsidian';
import { snapshot } from '../src/runtime';
import { exportCanvas, saveHTML } from '../src/export';
import { EN } from '../src/i18n';
import { parseCanvas } from '../src/canvas';
import { computed } from '../src/styles';
import { edgeReference, verifyEdgePaint } from './edge-qa';

declare const __QA_EDGES_ONLY__:boolean;

interface NativeReference {
  id:string; text:string|null; width:string; font:string; fontSize:string; lineHeight:string;
  paragraphMargin:string; scroll:number; client:number; previewHTML:string;
}

// Included only in a local --qa or --qa-edges build. Release builds eliminate this module.
export async function runQA(app:App):Promise<void> {
  const base=`${app.vault.configDir}/plugins/simple-canvas-exporter`;
  try {
    await app.vault.adapter.write(`${base}/qa-progress.json`,JSON.stringify({phase:'starting',time:new Date().toISOString()}));
    const leaf=app.workspace.getLeavesOfType('canvas').find(l=>(l.view as unknown as {file?:{path:string}}).file?.path==='example-canvas.canvas');
    if(!leaf)throw Error('Open example-canvas.canvas to run QA.');
    const snap=snapshot(leaf.view);
    const nativeReference:NativeReference[]=[];
    const stage=snap.document.defaultView!.createDiv({cls:'canvas sce-staging'});
    (snap.native?.wrapperEl??snap.document.body).appendChild(stage);
    for(const n of snap.data.nodes){
      const source=snap.native?.nodes?.get(n.id)?.nodeEl;
      if(!source)continue;
      const copy=source.cloneNode(true) as HTMLElement;copy.style.removeProperty('transform');copy.style.removeProperty('position');copy.addClass('sce-render-node');stage.appendChild(copy);
      const preview=copy.querySelector<HTMLElement>('.markdown-preview-view');
      if(preview){const p=preview.querySelector('p,center')!;const st=computed(p);nativeReference.push({id:n.id,text:preview.textContent,width:computed(p).width,font:st.fontFamily,fontSize:st.fontSize,lineHeight:st.lineHeight,paragraphMargin:st.margin,scroll:preview.scrollHeight,client:preview.clientHeight,previewHTML:preview.innerHTML});}
      copy.remove();
    }stage.remove();
    const edgePaint=edgeReference(snap);
    const result=await exportCanvas(app,snap,EN,new AbortController().signal,(done,total)=>{void app.vault.adapter.write(`${base}/qa-progress.json`,JSON.stringify({phase:'rendering',done,total}));});
    await app.vault.adapter.write(`${base}/qa-edge-paint.json`,JSON.stringify(edgePaint,null,2));
    await app.vault.adapter.write(`${base}/qa-export.html`,result.html);
    verifyEdgePaint(snap.document,result.html,edgePaint);
    if(result.cards!==25||result.connections!==24||result.nativePaths!==24||result.warnings.length)throw Error('Example Canvas export changed unexpectedly.');
    if((result.html.match(/class="badge /g)??[]).length!==16)throw Error('Expected all 16 badges.');
    const nativeMeasurements=result.metrics.map(metric=>{
      const native=nativeReference.find(reference=>reference.id===metric.id);
      if(!native)throw Error(`Missing native reference: ${metric.id}`);
      const scrollDifference=metric.scrollHeight-native.scroll,clientDifference=metric.clientHeight-native.client;
      // The default-theme typography baseline is separate from themed edge tests.
      if(!__QA_EDGES_ONLY__&&(Math.abs(scrollDifference)>2||Math.abs(clientDifference)>1))throw Error(`Card layout changed: ${metric.id} (scroll ${scrollDifference}, client ${clientDifference}).`);
      return {id:metric.id,scrollDifference,clientDifference};
    });
    await app.vault.adapter.write(`${base}/qa-layout.json`,JSON.stringify(nativeMeasurements,null,2));
    await app.vault.adapter.write(`${base}/qa-result.json`,JSON.stringify({...result,html:undefined},null,2));
    await app.vault.adapter.write(`${base}/qa-native-reference.json`,JSON.stringify(nativeReference,null,2));
    await app.vault.adapter.write(`${base}/qa-native-paths.json`,JSON.stringify(snap.data.edges.map(e=>({id:e.id,path:snap.native?.edges?.get(e.id)?.lineGroupEl?.querySelector('.canvas-display-path')?.getAttribute('d')})),null,2));
    const colors=['blue','green','purple','red','orange','yellow','cyan','pink'];
    const fixture=parseCanvas(JSON.stringify({nodes:[
      {id:'links',type:'text',x:0,y:0,width:400,height:240,text:'[[missing|显示别名]] [[missing#Heading|标题别名]]\n\n`[[code literal]]`\n\n<center>居中测试</center>\n\n<span class="badge badge-custom" style="--simple-badge-color:#e67e22">自定义 &amp; 标签</span>'},
      {id:'badges',type:'text',x:460,y:0,width:400,height:240,color:'4',text:colors.map(c=>`<span class="badge badge-${c}">${c}</span>`).join(' ')+'\n\n- item one\n- item two\n\n> quote'},
      {id:'safety',type:'text',x:0,y:320,width:400,height:240,text:'<script>window.SCE_UNSAFE=true</script>\n\n<img src="https://example.invalid/image.png" onerror="window.SCE_UNSAFE=true" alt="Remote placeholder">\n\n[Unsafe](javascript:alert(1))\n\n```html\n</script><script>bad()</script>\n```'},
      {id:'unknown',type:'file',file:'missing.pdf',x:460,y:320,width:400,height:240},
      {id:'image',type:'text',x:920,y:0,width:400,height:240,text:'![Local image](sce-qa-assets/pixel.png)'},
    ],edges:[{id:'double',fromNode:'links',toNode:'badges',fromSide:'right',toSide:'left',fromEnd:'arrow',toEnd:'arrow',color:'4',label:'Two arrows'},{id:'no-arrow',fromNode:'links',toNode:'safety',fromSide:'bottom',toSide:'top',toEnd:'none'}]}));
    // A tiny valid PNG used only by the local QA build.
    const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
    if(!await app.vault.adapter.exists('sce-qa-assets'))await app.vault.createFolder('sce-qa-assets');
    if(!await app.vault.adapter.exists('sce-qa-assets/pixel.png'))await app.vault.createBinary('sce-qa-assets/pixel.png',bytes.buffer);
    const extra=await exportCanvas(app,{...snap,data:fixture},EN,new AbortController().signal);
    await app.vault.adapter.write(`${base}/qa-fixture.html`,extra.html);
    await app.vault.adapter.write(`${base}/qa-fixture-result.json`,JSON.stringify({...extra,html:undefined},null,2));
    const signal=new AbortController().signal;
    const requested=`sce-qa-assets/save-${Date.now()}.html`;
    const first=await saveHTML(app,requested,'first export',signal);
    const second=await saveHTML(app,requested,'second export',signal);
    if(first===second||await app.vault.adapter.read(first)!=='first export'||await app.vault.adapter.read(second)!=='second export')throw Error('No-overwrite check failed.');
    const cancelled=new AbortController();
    const pending=exportCanvas(app,{...snap,data:fixture},EN,cancelled.signal);cancelled.abort();
    let aborted=false;try{await pending;}catch{aborted=true;}
    if(!aborted||snap.document.querySelector('.sce-staging'))throw Error('Cancellation cleanup failed.');
    const temp=await app.vault.create(`sce-qa-assets/snapshot-${Date.now()}.canvas`,JSON.stringify({nodes:[{id:'fresh',type:'text',x:0,y:0,width:400,height:200,text:'disk version'}],edges:[]}));
    const temporaryLeaf=app.workspace.getLeaf('tab');
    try{
      await temporaryLeaf.openFile(temp);
      if(!(temporaryLeaf.view instanceof TextFileView))throw Error('Expected a text file view.');
      temporaryLeaf.view.setViewData(JSON.stringify({nodes:[{id:'fresh',type:'text',x:123,y:-456,width:400,height:200,text:'unsaved current version'}],edges:[]}),true);
      const current=snapshot(temporaryLeaf.view);
      if(current.data.nodes[0].text!=='unsaved current version'||current.data.nodes[0].x!==123||current.data.nodes[0].y!==-456)throw Error('Current-view snapshot failed.');
      if(!(await app.vault.read(temp)).includes('disk version'))throw Error('Snapshot fixture was already saved.');
      // Use a separate Canvas so its real SVG parents and theme palette are exercised.
      const edgeColors=[undefined,'1','2','3','4','5','6','#e67e22'];
      const colored={nodes:[{id:'from',type:'text',x:0,y:0,width:200,height:100,text:'From'},{id:'to',type:'text',x:400,y:0,width:200,height:100,text:'To'}],
        edges:edgeColors.map((color,index)=>({id:`color-${index}`,fromNode:'from',toNode:'to',fromSide:'right',toSide:'left',fromEnd:index===1?'arrow':'none',toEnd:index===2?'none':'arrow',color}))};
      const colorFile=await app.vault.create(`sce-qa-assets/edges-${Date.now()}.canvas`,JSON.stringify(colored));
      await temporaryLeaf.openFile(colorFile);
      await temporaryLeaf.view.containerEl.win.nextFrame();
      const colorSnap=snapshot(temporaryLeaf.view),colorReference=edgeReference(colorSnap);
      const colorExport=await exportCanvas(app,colorSnap,EN,signal);
      verifyEdgePaint(colorSnap.document,colorExport.html,colorReference);
      if(colorExport.nativePaths!==edgeColors.length)throw Error('Colored edges did not use native paths.');
      await app.vault.adapter.write(`${base}/qa-colored-edges.html`,colorExport.html);
      await app.vault.adapter.write(`${base}/qa-colored-edge-paint.json`,JSON.stringify(colorReference,null,2));
    }finally{temporaryLeaf.detach();app.workspace.setActiveLeaf(leaf,{focus:false});}
    await app.vault.adapter.write(`${base}/qa-behavior.json`,JSON.stringify({noOverwrite:true,cancellationCleanup:true,unsavedSnapshot:true,nativeEdgePaint:true,coloredEdgePaint:true,nativeLayoutChecked:!__QA_EDGES_ONLY__,first,second},null,2));
  }catch(error){await app.vault.adapter.write(`${base}/qa-result.json`,JSON.stringify({error:String(error),stack:error instanceof Error?error.stack:undefined}));}
}
