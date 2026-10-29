import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFields} from '../qa/fields.mjs';
const values=text=>parseFields(text).map(({name,value})=>[name,value]);
test('literal fields, Unicode, trimming, duplicates and first equals separator',()=>{
  assert.deepEqual(values('**{sce:会议=ACL 2024}** | WatME {sce: 年份 = 2024 } {sce:主题=水印} {sce:主题=水印} {sce:式子=a=b}'),[['会议','ACL 2024'],['年份','2024'],['主题','水印'],['主题','水印'],['式子','a=b']]);
  const text='🐈 {sce:论文=中 & 文}';const [field]=parseFields(text);assert.equal(text.slice(field.start,field.end),'{sce:论文=中 & 文}');
});
test('malformed, nested, multiline, foreign and rich fields stay literal',()=>{
  for(const raw of ['[会议:: ACL 2024]','{other:会议=ACL}','{SCE:会议=ACL}','{sce:会议=}','{sce:=ACL}','{sce:会议 ACL}','{sce:会议=ACL','{sce:会议=ACL\n2024}','{sce:会议={sce:年份=2024}}','{sce:会议=**ACL**}','{sce:会议=[ACL](https://example.com)}','{sce:会议=<b>ACL</b>}'])assert.deepEqual(values(raw),[],raw);
  assert.deepEqual(values('{sce:bad=unfinished\n{sce:会议=ACL}'),[['会议','ACL']]);
  assert.deepEqual(values('{{sce:会议=ACL}} {other:{sce:会议=ACL}}'),[]);
});
test('literal punctuation and large inventories',()=>{
  assert.deepEqual(values('{sce:名称=A&B "C" / 中文 🐈}'),[['名称','A&B "C" / 中文 🐈']]);
  assert.equal(parseFields('{sce:会议=ACL} '.repeat(10000)).length,10000);
});
