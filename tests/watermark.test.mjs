import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWatermark,watermarkProblem} from '../qa/watermark.mjs';

test('disabled watermark omits even invalid or private text',()=>{
  for(const options of [undefined,{}, {enabled:false,text:'private'.repeat(40)}]){
    assert.equal(watermarkProblem(options),undefined);assert.equal(normalizeWatermark(options),undefined);
  }
});
test('enabled watermark requires a normalized single line of at most 40 Unicode code points',()=>{
  assert.equal(watermarkProblem({enabled:true,text:' \n\t '}),'empty');
  assert.equal(watermarkProblem({enabled:true,text:'中'.repeat(41)}),'long');
  assert.equal(watermarkProblem({enabled:true,text:'😀'.repeat(40)}),undefined);
  assert.equal(watermarkProblem({enabled:true,text:'😀'.repeat(41)}),'long');
  assert.deepEqual(normalizeWatermark({enabled:true,text:'  资料\n \t<&>"\'  '}),{text:'资料 <&>"\'',opacity:8});
  assert.equal(normalizeWatermark({enabled:true,text:' '}),undefined);
});
test('opacity has safe finite bounds and normalization returns an independent snapshot',()=>{
  for(const [input,expected] of [[NaN,8],[Infinity,8],[-1,4],[100,16],[12,12]])assert.equal(normalizeWatermark({enabled:true,text:'资料',opacity:input}).opacity,expected);
  const options={enabled:true,text:'作者',opacity:8};const result=normalizeWatermark(options);options.text='changed';options.opacity=16;
  assert.deepEqual(result,{text:'作者',opacity:8});
});
