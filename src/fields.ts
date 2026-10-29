/** A deliberately small, literal grammar. Use inline/fenced code to show examples. */
export interface CanvasField {name:string;value:string;start:number;end:number}
export function parseFields(text:string):CanvasField[] {
  const fields:CanvasField[]=[];
  for(let from=0;from<text.length;){
    const start=text.indexOf('{',from);if(start<0)break;
    let end=start+1,depth=1,nested=false;
    for(;end<text.length&&depth;end++){
      if(text[end]==='{'){depth++;nested=true;}
      else if(text[end]==='}')depth--;
      if(text[end]==='\n'||text[end]==='\r')break;
    }
    from=Math.max(start+1,end);
    if(depth||nested||!text.startsWith('{sce:',start))continue;
    const body=text.slice(start+5,end-1),separator=body.indexOf('=');
    if(separator<0)continue;
    const name=body.slice(0,separator).trim(),value=body.slice(separator+1).trim();
    // Markdown and nested delimiters inside a field are intentionally unsupported.
    if(!name||!value||/[\\`*_[\]<>]/u.test(name+value)||Array.from(name+value).some(c=>c.charCodeAt(0)<32))continue;
    fields.push({name,value,start,end});
  }
  return fields;
}

/** Shared by Canvas reading and export. Never writes to the editor or Canvas data. */
export function renderFields(root:HTMLElement):void {
  const doc=root.ownerDocument;
  const walker=doc.createTreeWalker(root,4 /* SHOW_TEXT */),texts:Text[]=[];
  let node:Node|null;
  while((node=walker.nextNode())){
    const parent=node.parentElement;
    if(parent&&!parent.closest('pre,code,a,script,style,textarea,svg,math,.math,.cm-editor,[contenteditable="true"],.sce-field,.badge'))texts.push(node as Text);
  }
  for(const text of texts){
    const raw=text.data,fields=parseFields(raw);
    if(!fields.length)continue;
    const fragment=doc.createDocumentFragment();let position=0;
    for(const field of fields){
      fragment.appendChild(doc.createTextNode(raw.slice(position,field.start)));
      const span=doc.createElement('span');span.className='sce-field';span.textContent=field.value;
      span.dataset.sceFieldName=field.name;span.dataset.sceFieldValue=field.value;
      fragment.appendChild(span);position=field.end;
    }
    fragment.appendChild(doc.createTextNode(raw.slice(position)));text.replaceWith(fragment);
  }
}
