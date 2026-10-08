import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReport,compareReports,filterFindings,identityOf,makeIssue} from './analysis.mjs';
const finding=(id,level='high')=>({id,ruleId:'runtime.'+id,severity:level,viewport:{width:375,height:812},title:'Issue '+id,description:'Crash '+id});
const report=findings=>({schemaVersion:1,target:'http://localhost:3000',findings});
test('validates version and findings',()=>{
 assert.throws(()=>parseReport('{}'),/schemaVersion/);
 assert.throws(()=>parseReport(report([{ruleId:'bad',severity:'critical',viewport:{width:1,height:2}}])),/Invalid/);
 assert.equal(parseReport(report([])).findings.length,0);
});
test('classifies new existing and resolved findings',()=>{
 const r=compareReports(report([finding('same'),finding('added','medium')]),report([finding('same'),finding('removed')]));
 assert.deepEqual(r.counts,{total:2,high:1,medium:1,low:0,new:1,existing:1,resolved:1});
 assert.deepEqual(r.findings.map(f=>f.change),['existing','new','resolved']);
});
test('without baseline stays uncompared',()=>assert.equal(compareReports(report([finding('a')])).findings[0].change,'uncompared'));
test('duplicate findings match one-to-one',()=>assert.deepEqual(compareReports(report([finding('a'),finding('a')]),report([finding('a')])).findings.map(f=>f.change),['existing','new']));
test('resource identity ignores status code',()=>{
 const f={...finding('x'),ruleId:'resources.http-error',description:'image at https://site.test/a.png (HTTP 404)'};
 assert.equal(identityOf(f),identityOf({...f,description:'image at https://site.test/a.png (HTTP 500)'}));
});
test('search filters combine correctly',()=>{
 const x=[{...finding('a'),change:'new'},{...finding('b','low'),change:'resolved'}];
 assert.equal(filterFindings(x,{query:'Issue a',severity:'high',change:'new'}).length,1);
 assert.equal(filterFindings(x,{change:'resolved'}).length,1);
});
test('GitHub issue includes context',()=>assert.match(makeIssue(finding('a'),'http://localhost'),/Viewport: 375x812/));

test('same rule on different pages is distinct during comparison',()=>{
 const a={...finding('same'),pageUrl:'http://localhost/a'};
 const b={...finding('same'),pageUrl:'http://localhost/b'};
 const result=compareReports(report([b]),report([a]));
 assert.equal(result.counts.new,1);
 assert.equal(result.counts.resolved,1);
 assert.match(makeIssue(b,'http://localhost'),/Page: http:\/\/localhost\/b/);
});
