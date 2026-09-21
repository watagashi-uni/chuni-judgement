// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const {Worker}=require('node:worker_threads');
const ROOT=path.resolve(__dirname,'..');const MAX_BODY=2*1024*1024;
const files=new Map([
 ['/', ['public/index.html','text/html; charset=utf-8']],
 ['/app.js',['public/app.js','text/javascript; charset=utf-8']],
 ['/style.css',['public/style.css','text/css; charset=utf-8']],
 ['/LICENSE',['LICENSE','text/plain; charset=utf-8']],
 ['/NOTICE',['NOTICE','text/plain; charset=utf-8']],
]);
function readBody(req){return new Promise((resolve,reject)=>{
 let size=0,done=false,chunks=[];
 req.on('data',chunk=>{if(done)return;size+=chunk.length;if(size>MAX_BODY){done=true;chunks=[];reject(Object.assign(Error('文件超过 2 MiB 限制'),{status:413}));}else chunks.push(chunk);});
 req.on('end',()=>{if(!done){done=true;resolve(Buffer.concat(chunks).toString('utf8'));}});
 req.on('error',()=>{if(!done){done=true;reject(Error('读取文件失败'));}});
});}
function renderInWorker(data){return new Promise((resolve,reject)=>{
 const worker=new Worker(path.join(__dirname,'worker.js'),{workerData:data,resourceLimits:{maxOldGenerationSizeMb:192}});
 let finished=false;const finish=(err,result)=>{if(finished)return;finished=true;clearTimeout(timer);worker.terminate();err?reject(err):resolve(result);};
 const timer=setTimeout(()=>finish(Error('渲染超时，请缩小谱面或降低渲染比例')),15000);
 worker.once('message',m=>m.ok?finish(null,m.image):finish(Error(m.error)));
 worker.once('error',()=>finish(Error('渲染资源不足或数据无效')));
 worker.once('exit',code=>{if(!finished)finish(Error('渲染进程提前退出'));});
});}
async function readLocalChart(name, directory) {
 if(!/^\d{4,}_0[0-5]$/.test(name||''))throw Object.assign(Error('name 应为歌曲ID_难度，例如 1086_03'),{status:400});
 if(!directory)throw Object.assign(Error('尚未配置本地谱面目录'),{status:503});
 try {
  const root=await fs.promises.realpath(directory);
  const file=await fs.promises.realpath(path.join(root,name+'.c2s'));
  const relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Outside chart directory');
  const stat=await fs.promises.stat(file);
  if(!stat.isFile())throw Error('Not a file');
  if(stat.size>MAX_BODY)throw Object.assign(Error('文件超过 2 MiB 限制'),{status:413});
  return await fs.promises.readFile(file,'utf8');
 } catch(e){if(e.status===413)throw e;throw Object.assign(Error('本地没有该谱面'),{status:404});}
}
function createServer({chartDir=process.env.CHART_DIR}={}){
 let active=0;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/healthz'){res.setHeader('Content-Type','application/json');res.end('{"ok":true}');return;}
  if(req.method==='GET'&&files.has(url.pathname)){
   const [file,type]=files.get(url.pathname);res.setHeader('Content-Type',type);fs.createReadStream(path.join(ROOT,file)).pipe(res);return;
  }
  const localRequest=req.method==='GET' && ['/preview','/api/render'].includes(url.pathname);
  if(!localRequest && (req.method!=='POST'||url.pathname!=='/api/render')){res.writeHead(404);res.end('Not found');return;}
  if(active>=2){res.writeHead(429,{'Content-Type':'application/json','Retry-After':'5'});res.end(JSON.stringify({error:'渲染繁忙，请稍后重试'}));req.resume();return;}
  active++;
  try {
   const chart=localRequest?await readLocalChart(url.searchParams.get('name'),chartDir):await readBody(req),format=url.pathname==='/preview'?'html':url.searchParams.get('format')||'svg';
   if(!['svg','html'].includes(format))throw Error('不支持的输出格式');
   const options={showJudgement:url.searchParams.get('judge')!=='0',easy:url.searchParams.has('easy')?url.searchParams.get('easy')==='1':localRequest&&Number(url.searchParams.get('name')?.split('_')[1])<2,protection:url.searchParams.get('protection')!=='0',pixelsPerSecond:Number(url.searchParams.get('scale')||560),secondsPerColumn:Number(url.searchParams.get('column')||4.5)};
   const image=await renderInWorker({chart,format,options});
   res.setHeader('Content-Type',format==='svg'?'image/svg+xml; charset=utf-8':'text/html; charset=utf-8');
   res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
   res.setHeader('Content-Disposition',`inline; filename="judgement.${format}"`);res.end(image);
  } catch(e){if(!res.headersSent){res.writeHead(e.status||400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}}
  finally {active--;}
 });
 server.requestTimeout=30000;server.headersTimeout=10000;
 return server;
}
if(require.main===module){const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3000);createServer().listen(port,host,()=>console.log(`chuni-judgement listening on ${host}:${port}`));}
module.exports={createServer};
