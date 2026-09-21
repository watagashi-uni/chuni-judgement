const {test}=require('node:test');const assert=require('node:assert/strict');
const {parseC2S,renderSvg}=require('../src');
const base='BPM_DEF\t170.5\nMET_DEF\t4\t4\nRESOLUTION\t384\n';
test('fractional BPM integration is exact across changes',()=>{
 const c=parseC2S(base+'TAP\t1\t0\t0\t4\nBPM\t2\t0\t168.75\nTAP\t3\t0\t8\t4');
 assert.ok(Math.abs(c.notes[0].time-240/170.5)<1e-12);
 assert.ok(Math.abs(c.notes[1].time-(480/170.5+240/168.75))<1e-12);
});
test('hold and slide heads are inferred, continuations do not add false heads',()=>{
 const c=parseC2S(base+'HXD\t0\t0\t0\t4\t96\nSLC\t1\t0\t0\t4\t96\t4\t4\nSLD\t1\t96\t4\t4\t96\t8\t4');
 assert.equal(c.notes.filter(n=>n.type==='CHR').length,1);assert.equal(c.notes.filter(n=>n.type==='SLD_H').length,1);
});
test('half-lane air paths work while fractional ground taps fail',()=>{
 const c=parseC2S(base+'ALD\t0\t0\t0\t4\t12\t1\t96\t3\t4\t1\tRED\nMET\t2\t0\t0\t0');
 assert.ok(c.notes.some(n=>!Number.isInteger(n.lane)));
 assert.throws(()=>parseC2S(base+'TAP\t0\t0\t0.5\t4'));
});
test('render contains legend and modified source; metadata cannot become markup',()=>{
 const svg=renderSvg(base+'CREATOR\t<script>alert(1)</script>\nTAP\t0\t0\t0\t4\nCHR\t1\t0\t4\t4');
 assert.ok(svg.includes('AGPL-3.0'));assert.ok(svg.includes('github.com/watagashi-uni/chuni-judgement'));
 assert.ok(svg.includes('JUSTICE CRITICAL'));assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('CREATOR'));
});
test('invalid input is rejected',()=>{
 for(const s of ['opaqueBase64==', 'BPM_DEF\t0',base+'TAP\t0\t0\t15\t4'])assert.throws(()=>parseC2S(s));
});
