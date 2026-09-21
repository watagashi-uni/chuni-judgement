#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs');const {renderSvg,renderHtml}=require('../src/index.js');
const [input,output,...args]=process.argv.slice(2);
if(!input||!output||args.some(x=>!['--easy','--no-protection'].includes(x))||!(/\.(svg|html)$/i.test(output))){console.error('Usage: chuni-judgement chart.c2s output.svg|output.html [--easy] [--no-protection]');process.exitCode=2;}
else try {
 const chart=fs.readFileSync(input,'utf8');const options={easy:args.includes('--easy'),protection:!args.includes('--no-protection')};
 fs.writeFileSync(output,output.endsWith('.html')?renderHtml(chart,options):renderSvg(chart,options));
} catch(e){console.error('Chart conversion failed: '+e.message);process.exitCode=1;}
