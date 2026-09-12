import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCanvas, fallbackGeometry, sceneBounds, anchor, escapeHTML, outputPath } from '../qa/core.mjs';
const raw=readFileSync(new URL('./fixtures/example.canvas',import.meta.url),'utf8');
const data=parseCanvas(raw);
test('sample is complete and applies default arrows',()=>{assert.equal(data.nodes.length,25);assert.equal(data.edges.length,24);assert.equal(data.warnings.length,0);for(const e of data.edges){assert.equal(e.fromEnd,'none');assert.equal(e.toEnd,'arrow');}});
test('negative coordinates and unusual card heights are retained',()=>{assert.deepEqual(sceneBounds(data.nodes,[]),{minX:-2560,minY:-3500,maxX:1740,maxY:-920});assert.equal(data.nodes.find(n=>n.id==='3249861287972d5b').height,205);});
test('fallback matches observed native paths on straight, curved and reverse connections',()=>{
  const expected={
    '6482673f4455c0b1':'M-160 -2260 L-160 -2253 M-160,-2253 C-160,-2160 -160,-2160 -160,-2067',
    'c6715d50aa2c5071':'M-320 -2030 L-327 -2030 M-327,-2030 C-477,-2030 -760,-2037 -760,-1887',
    '24d180bebe2ad0b0':'M-760 -2800 L-760 -2807 M-760,-2807 C-760,-2900 -760,-2900 -760,-2993',
  };
  for(const [id,path] of Object.entries(expected)){const e=data.edges.find(e=>e.id===id);const g=fallbackGeometry(e,data.nodes.find(n=>n.id===e.fromNode),data.nodes.find(n=>n.id===e.toNode));assert.equal(g.path,path);}
});
test('same-side and automatic-side connections have finite bounds',()=>{const a={id:'a',type:'text',text:'',x:0,y:0,width:100,height:60},b={...a,id:'b',x:200};for(const side of ['top','right','bottom','left',undefined]){const e={id:'e',fromNode:'a',toNode:'b',fromEnd:'arrow',toEnd:'none',fromSide:side,toSide:side};const g=fallbackGeometry(e,a,b);assert.ok(Object.values(g.bounds).every(Number.isFinite));assert.deepEqual(g.from,anchor(a,g.fromSide));assert.ok(g.path.endsWith(` L${g.to.x} ${g.to.y}`));}});
test('geometry bounds include a curve outside all cards',()=>{const a={id:'a',type:'text',x:0,y:0,width:100,height:60},b={...a,id:'b',x:200};const g=fallbackGeometry({id:'e',fromNode:'a',toNode:'b',fromSide:'top',toSide:'top',fromEnd:'none',toEnd:'arrow'},a,b);assert.ok(sceneBounds([a,b],[g.bounds]).minY<0);});
test('bad data fails without silently dropping cards',()=>{for(const value of [null,[],{nodes:{}},{nodes:[{id:'x',type:'text',x:0,y:0,width:-1,height:10,text:''}]},{nodes:[data.nodes[0],data.nodes[0]]}])assert.throws(()=>parseCanvas(JSON.stringify(value)));});
test('dangling connections are reported and valid cards survive',()=>{const result=parseCanvas(JSON.stringify({nodes:[data.nodes[0]],edges:[data.edges[0]]}));assert.equal(result.nodes.length,1);assert.equal(result.edges.length,0);assert.equal(result.warnings.length,1);});
test('empty canvas has finite default bounds',()=>{assert.deepEqual(parseCanvas('{}'),{nodes:[],edges:[],warnings:[]});assert.deepEqual(sceneBounds([],[]),{minX:0,minY:0,maxX:640,maxY:360});});
test('output paths cannot escape the vault or target hidden configuration',()=>{for(const name of ['../out.html','D:/out.html','/out.html','.obsidian/out.html','CON.html','folder/../out.html','foo.txt','folder//out.html'])assert.throws(()=>outputPath(name));assert.equal(outputPath('Exports\\图谱.html'),'Exports/图谱.html');});
test('document titles and attributes are escaped',()=>{assert.equal(escapeHTML('<script>"&\''),'&lt;script&gt;&quot;&amp;&#39;');});

test('output paths reject every embedded ASCII control character',()=>{
  for(let code=0;code<32;code++)assert.throws(()=>outputPath(`Exports/a${String.fromCharCode(code)}b.html`));
  assert.equal(outputPath('Exports/中文 & badges.html'),'Exports/中文 & badges.html');
});
