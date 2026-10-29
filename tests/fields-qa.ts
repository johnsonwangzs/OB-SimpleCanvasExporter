import { TFile, type App } from 'obsidian';
import { snapshot } from '../src/runtime';
import { exportCanvas } from '../src/export';
import { ZH } from '../src/i18n';

/** Run with --qa-fields. Keeps a dedicated, inspectable sample in the development vault. */
export async function runFieldsQA(app:App):Promise<void> {
  const base=`${app.vault.configDir}/plugins/simple-canvas-exporter`;
  try {
    const path='sce-fields-qa-1.4.0.canvas';
    const text='论文 WatME Towards Lossless Watermarking Through Lexical Redundancy\n\n**{sce:会议=ACL 2024}** | WatME\n\n<span class="badge badge-green">logits-based</span>\n\n通过词汇冗余构建水印。\n\n{sce:年份=2024} {sce:主题=水印} {sce:主题=大模型}\n\n脚注引用。[^1]\n\n[^1]: 字段与脚注共存。';
    const data=JSON.stringify({nodes:[
      {id:'paper-a',type:'text',x:0,y:0,width:450,height:430,text},
      {id:'paper-b',type:'text',x:500,y:0,width:450,height:430,text:'另一篇论文\n\n**{sce:会议=EMNLP 2025 Findings}**\n\n{sce:年份=2025} {sce:主题=水印}\n\n<span class="badge badge-green">logits-based</span>'},
      {id:'examples',type:'text',x:0,y:480,width:950,height:230,text:'字面示例：`{sce:会议=不提取}`\n\n```text\n{sce:会议=代码块}\n```\n\n[会议:: Dataview原有字段]\n\n{sce:会议=} {other:会议=不提取}'},
    ],edges:[]},null,2);
    const existing=app.vault.getAbstractFileByPath(path);
    const file=existing instanceof TFile?existing:await app.vault.create(path,data);
    const leaf=app.workspace.getLeavesOfType('canvas').find(l=>(l.view as unknown as {file?:TFile}).file?.path===path)??app.workspace.getLeaf('tab');
    await leaf.openFile(file);app.workspace.setActiveLeaf(leaf,{focus:true});
    const snap=snapshot(leaf.view),win=snap.document.defaultView!;
    for(let i=0;i<40&&!snap.native?.nodes?.get('paper-a')?.nodeEl?.querySelector('.sce-field');i++)await new Promise<void>(resolve=>win.setTimeout(resolve,250));
    const native=snap.native?.nodes?.get('paper-a')?.nodeEl;
    await app.vault.adapter.write(`${base}/qa-fields-native.html`,native?.outerHTML??'missing');
    if(native?.querySelector('strong .sce-field')?.textContent!=='ACL 2024')throw Error('Native Canvas reading did not render the bold conference field.');
    if(snap.data.nodes.find(n=>n.id==='paper-a')?.text!==text)throw Error('The Canvas source changed.');
    const result=await exportCanvas(app,snap,ZH,new AbortController().signal);
    await app.vault.adapter.write(`${base}/qa-fields.html`,result.html);
    const doc=new win.DOMParser().parseFromString(result.html,'text/html');
    if(doc.querySelectorAll('.sce-field[data-sce-field-name]').length!==7)throw Error('Unexpected exported field count.');
    if(doc.querySelector('[data-node-id="examples"] .sce-field'))throw Error('Examples entered the field catalog.');
    if(doc.querySelectorAll('a[data-sce-footnote]').length!==2)throw Error('Footnote regression.');
    await app.vault.adapter.write(`${base}/qa-fields-result.json`,JSON.stringify({passed:true,cards:result.cards,warnings:result.warnings,sourcePreserved:true,nativeBold:true},null,2));
  }catch(error){await app.vault.adapter.write(`${base}/qa-fields-result.json`,JSON.stringify({passed:false,error:String(error)},null,2));}
}
