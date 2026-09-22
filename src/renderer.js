// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 chuni-judgement contributors
'use strict';
const {parseC2S}=require('./parser.js');
const {protect,bands}=require('./judgement.js');
const escape = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const COLORS={JC:'#ffe15e',JUSTICE:'#ff8f48',ATTACK:'#52da8b',TOUCH:'#77baff'};
const SOURCE='https://github.com/watagashi-uni/chuni-judgement';
function renderSvg(input, options={}) {
  const chart=typeof input==='string'?parseC2S(input):input;
  const scale=options.pixelsPerSecond??560, seconds=options.secondsPerColumn??4.5, laneWidth=160;
  if(!Number.isFinite(scale)||scale<10||scale>2000||!Number.isFinite(seconds)||seconds<1||seconds>60)throw Error('Invalid rendering scale');
  const count=Math.max(1,Math.ceil((chart.duration+.15)/seconds)), stride=240, top=48, bottom=58;
  const height=top+seconds*scale+bottom,width=count*stride+32;
  if(width>60000 || width*height>150000000)throw Error('Chart image too large; adjust rendering scale');
  const showJudgement=options.showJudgement!==false;
  const judged=showJudgement?protect(chart.notes,Boolean(options.easy)):[],chunks=[];
  chunks.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Judgement chart"><style>text{font-family:sans-serif;fill:#e5edf7} .border{fill:none;stroke:#e0eafb;stroke-width:1;stroke-opacity:.7}</style><defs><pattern id="touch" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M-2 2L5 9M0 0L7 7M5-2L9 2" stroke="#77baff" opacity=".6"/></pattern></defs><rect width="100%" height="100%" fill="#293241"/>`);
  const legend=[['JC','JUSTICE CRITICAL'],['JUSTICE','JUSTICE'],['ATTACK','ATTACK'],['TOUCH','FLICK touch (not final grade)']];
  if(showJudgement)legend.forEach(([k,label],i)=>chunks.push(`<rect x="${24+i*200}" y="15" width="14" height="14" fill="${COLORS[k]}"/><text x="${44+i*200}" y="27" font-size="12">${label}</text>`));
  for(let col=0;col<count;col++) {
    const start=col*seconds,stop=start+seconds,x=40+col*stride,y=t=>top+(stop-t)*scale;
    chunks.push(`<defs><clipPath id="col${col}"><rect x="${x}" y="${top}" width="${laneWidth}" height="${seconds*scale}"/></clipPath></defs><rect x="${x}" y="${top}" width="${laneWidth}" height="${seconds*scale}" fill="#182435"/>`);
    for(const b of chart.beats)if(b.time>=start&&b.time<stop) {
      chunks.push(`<path d="M${x} ${y(b.time)}h${laneWidth}" stroke="${b.major?'#47b589':'#4a596a'}" stroke-width="${b.major?1.2:.5}"/>`);
      if(b.major)chunks.push(`<text x="${x-5}" y="${y(b.time)-3}" text-anchor="end" font-size="10">#${b.measure}</text>`);
    }
    for(const b of chart.tempos)if(b.time>=start&&b.time<stop)chunks.push(`<text x="${x+laneWidth+4}" y="${y(b.time)-4}" font-size="10">${b.bpm}</text>`);
    chunks.push(`<g clip-path="url(#col${col})">`);
    for(const n of chart.holds)if(n.endTime>=start&&n.time<=stop)chunks.push(`<rect x="${x+n.lane*10}" y="${y(n.endTime)}" width="${n.width*10}" height="${(n.endTime-n.time)*scale}" fill="${n.type[0]==='A'?'#ae74f7':'#edb36b'}" opacity=".62"/>`);
    for(const n of [...chart.slides,...chart.airPaths])if(n.endTime>=start&&n.time<=stop && n.color!=='NON') {
      chunks.push(`<polygon points="${x+n.lane*10},${y(n.time)} ${x+(n.lane+n.width)*10},${y(n.time)} ${x+(n.endLane+n.endWidth)*10},${y(n.endTime)} ${x+n.endLane*10},${y(n.endTime)}" fill="${n.type.startsWith('A')?'#bf83ed':'#42dbea'}" opacity=".6"/>`);
    }
    const outlines=[];
    for(const n of judged) {
      if(n.time+.11<start||n.time-.11>stop)continue;
      const merged=[],cells=[];
      for(let lane=n.lane;lane<n.lane+n.width;lane++) {
        const bs=bands(n,lane,{easy:!!options.easy,protection:options.protection!==false});
        if(bs.length)cells.push({lane,lo:n.time+bs[0].from,hi:n.time+bs.at(-1).to});
        for(const b of bs) {
          const previous=merged.find(p=>p.end===lane&&p.grade===b.grade&&Math.abs(p.from-b.from)<1e-9&&Math.abs(p.to-b.to)<1e-9);
          if(previous)previous.end++;else merged.push({...b,lane,end:lane+1});
        }
      }
      for(const b of merged)chunks.push(`<rect x="${x+b.lane*10}" y="${y(n.time+b.to)}" width="${(b.end-b.lane)*10}" height="${(b.to-b.from)*scale}" fill="${b.grade==='TOUCH'?'url(#touch)':COLORS[b.grade]}" fill-opacity=".4"><title>${escape(n.type)} ${n.time.toFixed(6)}s ${b.grade} ${(b.from*1000).toFixed(2)}…${(b.to*1000).toFixed(2)}ms</title></rect>`);
      // Each independent non-empty lane run gets an outer contour only.
      let runs=[],run=[];for(const c of cells){if(run.length&&run.at(-1).lane+1!==c.lane){runs.push(run);run=[];}run.push(c);}if(run.length)runs.push(run);
      for(const r of runs){const pts=r.flatMap(c=>[[x+c.lane*10,y(c.lo)],[x+(c.lane+1)*10,y(c.lo)]]).concat([...r].reverse().flatMap(c=>[[x+(c.lane+1)*10,y(c.hi)],[x+c.lane*10,y(c.hi)]]));outlines.push(`<path class="border" d="${pts.map((p,i)=>`${i?'L':'M'}${p.join(' ')}`).join(' ')}Z"/>`);}
    }
    chunks.push(...outlines);
    for(const n of chart.notes)if(n.time>=start-.02&&n.time<stop+.02) {
      const nx=x+n.lane*10,ny=y(n.time),w=n.width*10;
      const groundColors={TAP:'#ff6376',CHR:'#ffe320',FLK:'#77baff',MNE:'#b633cd',HLD_H:'#ff913b',HLD_T:'#ffbd66',SLD_H:'#ff913b',SLD_T:'#68f3fa'};
      if(groundColors[n.type])chunks.push(`<rect x="${nx+.5}" y="${ny-3}" width="${Math.max(0,w-1)}" height="6" rx="2" fill="${n.critical ? groundColors.CHR : groundColors[n.type]}"/>`);
      else if(['AIR','AUR','AUL','ADW','ADR','ADL'].includes(n.type)) {
        const down=n.type.startsWith('AD');chunks.push(`<path d="M${nx} ${ny+(down?-10:10)}L${nx+w/2} ${ny+(down?4:-4)}L${nx+w} ${ny+(down?-10:10)}" fill="none" stroke="${down?'#fb8bd2':'#71ed82'}" stroke-width="3"/>`);
      } else chunks.push(`<rect x="${nx}" y="${ny-2}" width="${w}" height="4" fill="#d592fa"/>`);
    }
    chunks.push('</g>');
  }
  chunks.push(`<text x="24" y="${height-33}" font-size="12">Static ground windows · AIR / sustained input history not simulated</text><a href="${SOURCE}"><text x="24" y="${height-14}" font-size="13">Modified renderer: watagashi-uni/chuni-judgement (AGPL-3.0) · ${SOURCE}</text></a></svg>`);
  return chunks.join('\n');
}
function renderHtml(input,options={}){return `<!doctype html><html lang="en"><meta charset="utf-8"><title>chuni-judgement</title><body style="margin:0;background:#293241"><main id="chuni-judgement-render">${renderSvg(input,options)}</main></body></html>`;}
module.exports={renderSvg,renderHtml};
