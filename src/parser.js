// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 chuni-judgement contributors
// C2S field conventions follow QingQiz/MarisaBot; see NOTICE.
'use strict';
function parseC2S(text) {
  if (typeof text !== 'string' || text.length > 16 * 1024 * 1024) throw Error('Expected a C2S chart (up to 16 MiB)');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim().split(/\s+/)).filter(l => l[0] && !l[0].startsWith('//'));
  const resolution = Number(lines.find(l => l[0] === 'RESOLUTION')?.[1] || 384);
  if (!Number.isFinite(resolution) || resolution <= 0) throw Error('Invalid resolution');
  const number = (value, label) => {const n = Number(value);if (value === undefined || !Number.isFinite(n)) throw Error(`Invalid ${label}`);return n;};
  const tick = l => number(l[1], 'measure') * resolution + number(l[2], 'offset');
  const bpms = new Map();
  const initial = Number(lines.find(l => l[0] === 'BPM_DEF')?.[1]);
  if (initial > 0) bpms.set(0, initial);
  for (const l of lines) if (l[0] === 'BPM') {
    const bpm = number(l[3], 'BPM');if (bpm <= 0) throw Error('BPM must be positive');bpms.set(tick(l), bpm);
  }
  const tempos = [...bpms].sort((a,b) => a[0]-b[0]).map(([tick,bpm])=>({tick,bpm,time:0}));
  if (!tempos.length || tempos[0].tick !== 0) throw Error('Invalid C2S format or missing initial BPM');
  for (let i=1;i<tempos.length;i++) tempos[i].time = tempos[i-1].time + (tempos[i].tick-tempos[i-1].tick)*240/(resolution*tempos[i-1].bpm);
  function toSeconds(t) {
    let lo=0,hi=tempos.length;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(tempos[mid].tick<=t)lo=mid;else hi=mid;}
    const b=tempos[lo];return b.time+(t-b.tick)*240/(resolution*b.bpm);
  }
  const notes=[],holds=[],slides=[],airPaths=[],warnings=new Set();
  const rice=new Set(['TAP','CHR','FLK','MNE','AIR','AUR','AUL','ADW','ADR','ADL']);
  const basic=l=>({type:l[0],tick:tick(l),lane:number(l[3],'lane'),width:number(l[4],'width')});
  for (const l of lines) {
    const k=l[0];
    if (rice.has(k)) notes.push(basic(l));
    else if (['HLD','HXD','AHD','AHX'].includes(k)) {
      const n=basic(l),air=k[0]==='A';n.endTick=n.tick+number(l[air?6:5],'duration');holds.push(n);
      if (!air) notes.push({...n,type:k==='HXD'?'CHR':'HLD_H'});
      else if (!['AHD','AHX'].includes(l[5])) notes.push({...n,type:'AHD_H'});
      notes.push({...n,tick:n.endTick,type:air?'AHD_T':'HLD_T'});
    } else if (['SLD','SLC','SXD','SXC'].includes(k)) {
      const n=basic(l);n.endTick=n.tick+number(l[5],'duration');n.endLane=number(l[6],'target lane');n.endWidth=l[7]===undefined?n.width:number(l[7],'target width');slides.push(n);
      if (k.endsWith('D')) notes.push({...n,type:'SLD_T',tick:n.endTick,lane:n.endLane,width:n.endWidth});
    } else if (['ASC','ASD','ALD'].includes(k)) {
      const n=basic(l);n.endTick=n.tick+number(l[7],'duration');n.endLane=number(l[8],'target lane');n.endWidth=number(l[9],'target width');n.color=l[11];airPaths.push(n);
      if (k==='ALD') {
        const interval=number(l[5],'air interval');if(interval<0)throw Error('Negative air interval');
        if(interval>0) for(let t=n.tick;t<n.endTick;t+=interval) {
          if(notes.length>100000)throw Error('Too many notes');
          const r=(t-n.tick)/(n.endTick-n.tick);notes.push({type:'ALD_T',tick:t,lane:n.lane+(n.endLane-n.lane)*r,width:n.width+(n.endWidth-n.width)*r});
        }
      } else {
        if (!['ASC','ASD','AHD'].includes(l[5])) notes.push({...n,type:k+'_H'});
        if(k==='ASD')notes.push({...n,type:'ASD_T',tick:n.endTick,lane:n.endLane,width:n.endWidth});
      }
    } else if (['SFL','SLP','SLA'].includes(k)) warnings.add('Scroll-speed effects are not applied: this renderer uses a linear time axis.');
  }
  const ends=new Set(slides.map(n=>[n.endTick,n.endLane,n.endWidth].join(':')));
  for(const n of slides)if(!ends.has([n.tick,n.lane,n.width].join(':')))notes.push({...n,type:n.type[1]==='X'?'CHR':'SLD_H'});
  const unique=[...new Map(notes.map(n=>[[n.type,n.tick,n.lane,n.width].join(':'),n])).values()].sort((a,b)=>a.tick-b.tick);
  const ground = require('./judgement.js').ground;
  for (const n of [...unique,...holds,...slides,...airPaths]) {
    if (n.tick<0 || n.width<=0 || n.lane<0 || n.lane+n.width>16 || n.endTick!==undefined && n.endTick<n.tick) throw Error('Invalid note geometry');
    if (n.endLane!==undefined && (n.endLane<0 || n.endWidth<=0 || n.endLane+n.endWidth>16)) throw Error('Invalid path endpoint');
    if (ground.has(n.type) && (!Number.isInteger(n.lane)||!Number.isInteger(n.width))) throw Error('Fractional ground-note lanes are not supported');
    n.time=toSeconds(n.tick);if(n.endTick!==undefined)n.endTime=toSeconds(n.endTick);
  }
  unique.forEach((n,id)=>n.id=id);
  const endTick=Math.max(0,...unique.map(n=>n.tick),...holds.map(n=>n.endTick),...slides.map(n=>n.endTick),...airPaths.map(n=>n.endTick));
  const def=lines.find(l=>l[0]==='MET_DEF');
  const meters=new Map([[0,{tick:0,numerator:Number(def?.[1]||4),denominator:Number(def?.[2]||4)}]]);
  for(const l of lines)if(l[0]==='MET' && Number(l[3])!==0 && Number(l[4])!==0)meters.set(tick(l),{tick:tick(l),numerator:number(l[4],'meter'),denominator:number(l[3],'meter')});
  const ms=[...meters.values()].sort((a,b)=>a.tick-b.tick),beats=[];let measure=0;
  for(let i=0;i<ms.length;i++) {
    const m=ms[i];if(m.numerator<=0||m.denominator<=0)throw Error('Invalid meter');
    const stop=ms[i+1]?.tick??endTick+1,step=resolution/m.denominator;
    for(let t=m.tick;t<stop;t+=step*m.numerator){
      if(beats.length>200000)throw Error('Too many beat lines');
      for(let b=0;b<m.numerator && t+b*step<stop;b++)beats.push({tick:t+b*step,time:toSeconds(t+b*step),measure,major:b===0});
      measure++;
    }
  }
  return {resolution,tempos,notes:unique,holds,slides,airPaths,beats,endTick,duration:toSeconds(endTick),warnings:[...warnings],toSeconds};
}
module.exports={parseC2S};
