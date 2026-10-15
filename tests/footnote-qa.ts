import { Component, MarkdownRenderer, type App } from 'obsidian';
import { snapshot } from '../src/runtime';
import { parseCanvas } from '../src/canvas';
import { exportCanvas } from '../src/export';
import { EN } from '../src/i18n';

/** Run with --qa-footnotes in a development vault with an open Canvas. */
export async function runFootnoteQA(app:App):Promise<void> {
  const base=`${app.vault.configDir}/plugins/simple-canvas-exporter`;
  try {
    const view=app.workspace.getLeavesOfType('canvas')[0]?.view;
    if(!view)throw Error('Open a Canvas before running footnote QA.');
    const snap=snapshot(view);
    const markdown='First reference.[^1] Named reference.[^note]\n\n'+
      Array.from({length:12},(_,i)=>`Paragraph ${i+1}: ordinary text for independent scrolling.`).join('\n\n')+
      '\n\nRepeated reference.[^1]\n\n'+Array.from({length:12},(_,i)=>`Later paragraph ${i+1}.`).join('\n\n')+
      '\n\n[^1]: FootnoteUnique **bold** *italic* `code` [external](https://example.com/)\n\n'+
      '    A second paragraph in the same footnote.\n\n[^note]: NamedFootnote content.';
    const component=new Component(),root=snap.document.defaultView!.createDiv();component.load();
    snap.document.body.appendChild(root);
    try {
      await MarkdownRenderer.render(app,markdown,root,snap.file.path,component);
      await app.vault.adapter.write(`${base}/qa-footnotes-rendered.html`,root.innerHTML);
    } finally {root.remove();component.unload();}
    const data=parseCanvas(JSON.stringify({nodes:[
      {id:'footnote-a',type:'text',text:markdown,x:0,y:0,width:430,height:260},
      {id:'footnote-b',type:'text',text:markdown,x:480,y:0,width:430,height:260},
    ],edges:[]}));
    const result=await exportCanvas(app,{...snap,data},EN,new AbortController().signal);
    await app.vault.adapter.write(`${base}/qa-footnotes.html`,result.html);
    const parsed=new snap.document.defaultView!.DOMParser().parseFromString(result.html,'text/html');
    const ids=Array.from(parsed.querySelectorAll('[id]'),el=>el.id);
    if(new Set(ids).size!==ids.length)throw Error('Duplicate exported IDs.');
    for(const card of parsed.querySelectorAll('.sce-card')){
      if(card.querySelectorAll('.footnotes li').length!==2)throw Error('Footnote definitions missing.');
      if(card.querySelectorAll('a[data-sce-footnote]').length!==6)throw Error('Footnote links missing.');
      for(const link of card.querySelectorAll('a[data-sce-footnote]')){
        const target=parsed.getElementById(link.getAttribute('href')!.slice(1));
        if(!target||!card.contains(target))throw Error('Footnote link leaves its own card.');
      }
    }
    const actual=await exportCanvas(app,snap,EN,new AbortController().signal);
    await app.vault.adapter.write(`${base}/qa-footnotes-current.html`,actual.html);
    await app.vault.adapter.write(`${base}/qa-footnotes-result.json`,JSON.stringify({passed:true,fixture:{cards:result.cards,warnings:result.warnings},current:{file:snap.file.path,cards:actual.cards,warnings:actual.warnings}},null,2));
  } catch(error){
    await app.vault.adapter.write(`${base}/qa-footnotes-result.json`,JSON.stringify({passed:false,error:String(error)},null,2));
    console.error('Footnote QA failed',error);
  }
}
