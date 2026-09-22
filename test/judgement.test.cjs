const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../src/judgement.js');
const M = globalThis.NewchartJudgement;
const note = (type, time, lane=0, width=4) => ({type,time,lane,width});
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

test('isolated normal note has JC/J/A; critical entire acceptance is JC', () => {
 const [tap,chr]=M.protect([note('TAP',1),note('CHR',2)]);
 assert.deepEqual(M.bands(tap,0).map(b=>b.grade),['ATTACK','JUSTICE','JC','JUSTICE','ATTACK']);
 const b=M.bands(chr,0);assert.equal(b.length,1);assert.equal(b[0].grade,'JC');near(b[0].from,-5/60);near(b[0].to,5/60);
});
test('overlapping notes 50 ms apart split at their midpoint', () => {
 const [a,b]=M.protect([note('TAP',1),note('TAP',1.05)]);
 near(M.bands(a,0).at(-1).to,.025);near(M.bands(b,0)[0].from,-.025);
});
test('partial overlap also restricts nonoverlap normal lanes to JC protection', () => {
 const [a,b]=M.protect([note('TAP',1,0,4),note('TAP',1.05,2,4)]);
 near(M.bands(a,2).at(-1).to,.025);near(M.bands(a,0).at(-1).to,2/60);
 near(M.bands(b,2)[0].from,-.025);near(M.bands(b,5)[0].from,-2/60);
});
test('partial overlap leaves critical nonoverlap lanes at full window', () => {
 const [a,b]=M.protect([note('CHR',1,0,4),note('CHR',1.05,2,4)]);
 near(M.bands(a,0).at(-1).to,5/60);near(M.bands(a,2).at(-1).to,.025);
 near(M.bands(b,5)[0].from,-5/60);
});
test('nonoverlap and simultaneous notes do not get artificial midpoint cuts', () => {
 for(const input of [[note('TAP',1,0),note('TAP',1.01,8)],[note('TAP',1),note('TAP',1)]]) {
  for(const n of M.protect(input)) {near(M.bands(n,n.lane)[0].from,-5/60);near(M.bands(n,n.lane).at(-1).to,5/60);}
 }
});
test('flick touch gate is never mislabelled as final judgement; other types excluded', () => {
 const n=M.protect([note('FLK',1),note('AIR',1),note('HLD_T',2)]);
 assert.equal(n.length,1);assert.deepEqual(M.bands(n[0],0).map(b=>b.grade),['TOUCH']);
});
test('easy window expands ATTACK to 100ms; disabling protection restores base window', () => {
 const n=M.protect([note('TAP',1),note('TAP',1.05)],true)[0];
 near(M.bands(n,0,{easy:true,protection:false}).at(-1).to,.1);
});
// Optional differential oracle: execute upstream cw() unmodified, pinned repo separately.
const repo = process.env.UMIGURI_RE;
if (repo) test('300 seeded mixed charts match upstream cw() across all 16 lanes', () => {
 const src=fs.readFileSync(`${repo}/open-umiguri/src/game/logic/0070-ExpressionStatement.js`,'utf8');
 const body=src.slice(src.indexOf('cw: function')+4,src.indexOf('\n    Tw:')) .replace(/,\s*$/,'');
 const cw=vm.runInNewContext(`(${body})`,{mathAbs:Math.abs,mathMin:Math.min,mathMax:Math.max,v_Tn_27663:'TAP',v_ce_27678:'SLD_H',v_le_27675:'HLD_H',v_Pn_27665:'FLK',v__0_27710:x=>x==='CHR'});
 let seed=123456789;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let trial=0;trial<300;trial++) {
  let time=0;const input=Array.from({length:25},()=>{time+=Math.floor(rand()*12)/120;const lane=Math.floor(rand()*16);return note(['TAP','CHR','HLD_H','SLD_H','FLK'][Math.floor(rand()*5)],time,lane,1+Math.floor(rand()*(16-lane)));});
  const easy=trial%2===0;
  const reference=input.map(n=>({Fi:n.type,od:n.time,ou:n.lane,Le:n.width,Jg:['HLD_H','SLD_H'].includes(n.type) && Array.from({length:n.width},(_,i)=>n.lane+i).every(lane=>input.some(c=>c.type==='CHR'&&c.time===n.time&&c.lane<=lane&&c.lane+c.width>lane)) ? 1 : 0,jg:Array(16).fill(Infinity),Hg:Array(16).fill(-Infinity),yw:0}));
  cw.call({yc:{$g:reference}},{Ra:{Kb:2/60,Mb:(easy?6:5)/60}});
  const result=M.protect(input,easy);
  result.forEach((n,i)=>{assert.deepEqual(n.early,reference[i].jg);assert.deepEqual(n.late,reference[i].Hg);assert.equal(n.miss,reference[i].yw);});
 }
});

test('critical covering a long head makes every lane JC and uses critical protection', () => {
 for (const type of ['HLD_H','SLD_H']) {
  const input=[note(type,1,0,8),note('CHR',1,0,4),note('CHR',1,4,4),note('TAP',1.05,6,4)];
  const head=M.protect(input)[0];
  assert.equal(head.type,type);assert.equal(head.critical,true);
  for(let lane=0;lane<8;lane++)assert.deepEqual(M.bands(head,lane).map(b=>b.grade),['JC']);
  near(M.bands(head,0)[0].to,5/60); // Critical non-overlap region stays wide.
  near(M.bands(head,7)[0].to,.025); // Actual overlap remains protected.
  assert.equal(input[0].critical,undefined); // No caller mutation.
 }
});
test('partial coverage, gaps, adjacent notes and different times do not promote a hold', () => {
 const head=note('HLD_H',1,0,8);
 for(const criticals of [[note('CHR',1,0,4)],[note('CHR',1,0,3),note('CHR',1,4,4)],[note('CHR',1,8,8)],[note('CHR',1.001,0,8)]]) {
  const n=M.protect([head,...criticals]).find(n=>n.type==='HLD_H');
  assert.notEqual(n.critical,true);assert.ok(M.bands(n,0).some(b=>b.grade==='JUSTICE'));
 }
});
test('a wider critical covers the full head but does not promote TAP or HOLD tail', () => {
 const input=[note('HLD_H',1,4,4),note('CHR',1,0,16),note('TAP',1,4,4),note('HLD_T',1,4,4)];
 const result=M.markCriticalHeads(input);
 assert.equal(result[0].critical,true);assert.equal(result[2].critical,undefined);assert.equal(result[3].critical,undefined);
});
test('raw tick identity prevents false matches between rounded display times', () => {
 const [n]=M.markCriticalHeads([{...note('HLD_H',1),tick:96},{...note('CHR',1),tick:97}]);
 assert.equal(n.critical,undefined);
});
