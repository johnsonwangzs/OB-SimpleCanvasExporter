import test from 'node:test';
import assert from 'node:assert/strict';
import {exportMetadata} from '../qa/metadata.mjs';

test('legacy exports retain the Canvas title and omit optional metadata',()=>{
  assert.deepEqual(exportMetadata('Original canvas'),{title:'Original canvas'});
  assert.deepEqual(exportMetadata('Original canvas',{title:' \t ',author:'Hidden author',showAuthor:false}),{title:'Original canvas'});
});
test('custom titles and authors become plain single-line text',()=>{
  assert.deepEqual(exportMetadata('Original',{title:'  研究\n计划  ',showAuthor:true,author:' Alice\t& Bob '}),{title:'研究 计划',author:'Alice & Bob'});
  assert.equal(exportMetadata('Original',{title:'<script>&"中文'}).title,'<script>&"中文');
});
test('author and time can each be enabled independently; blank authors are omitted',()=>{
  assert.deepEqual(exportMetadata('Original',{showAuthor:true,author:'  '}),{title:'Original'});
  assert.deepEqual(exportMetadata('Original',{showAuthor:true,author:'Alice',showTime:false}),{title:'Original',author:'Alice'});
  const metadata=exportMetadata('Original',{author:'Hidden',showTime:true},new Date('2026-09-18T02:03:04Z'));
  assert.equal(metadata.author,undefined);assert.equal(metadata.time.datetime,'2026-09-18T02:03:04.000Z');
});
test('the export time uses local calendar fields and records an unambiguous instant',()=>{
  const date=new Date(2026,8,18,10,3,4),metadata=exportMetadata('Original',{showTime:true},date);
  assert.equal(metadata.time.label,'2026-09-18 10:03');assert.match(metadata.time.detail,/^2026-09-18 10:03:04 UTC[+-]\d{2}:\d{2}$/);
  assert.equal(Date.parse(metadata.time.datetime),date.getTime());
});
test('the captured metadata is independent of later form and clock changes',()=>{
  const options={title:'First',showAuthor:true,author:'Alice',showTime:true},date=new Date(2026,8,18,10,3,4);
  const metadata=exportMetadata('Original',options,date);options.title='Second';options.author='Bob';date.setFullYear(2030);
  assert.equal(metadata.title,'First');assert.equal(metadata.author,'Alice');assert.equal(metadata.time.label,'2026-09-18 10:03');
});
