// SPDX-License-Identifier: AGPL-3.0-only
const {parentPort,workerData}=require('node:worker_threads');
const {parseC2S,renderSvg,renderHtml}=require('../src');
try {
 const chart=parseC2S(workerData.chart);
 if(chart.notes.length>12000)throw Error('谱面音符过多');
 const image=(workerData.format==='html'?renderHtml:renderSvg)(chart,workerData.options);
 parentPort.postMessage({ok:true,image});
} catch(e){parentPort.postMessage({ok:false,error:e.message});}
