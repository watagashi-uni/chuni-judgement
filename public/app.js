// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const file=document.getElementById('chart'),form=document.getElementById('render-form'),button=document.getElementById('render'),status=document.getElementById('status'),image=document.getElementById('result'),download=document.getElementById('download');let blobUrl;
file.addEventListener('change',()=>{document.getElementById('filename').textContent=file.files[0]?.name||'.c2s · 最大 2 MiB';});
form.addEventListener('submit',async event=>{
 event.preventDefault();const chart=file.files[0];if(!chart)return;
 if(chart.size>2*1024*1024){status.textContent='文件超过 2 MiB 限制';status.className='error';return;}
 button.disabled=true;status.className='';status.textContent='正在计算并渲染…';download.hidden=true;
 try {
  const params=new URLSearchParams({format:'svg',easy:document.getElementById('difficulty').value==='easy'?'1':'0',protection:document.getElementById('protection').checked?'1':'0',scale:document.getElementById('scale').value});
  const response=await fetch('/api/render?'+params,{method:'POST',headers:{'Content-Type':'text/plain; charset=utf-8'},body:await chart.text(),signal:AbortSignal.timeout(25000)});
  if(!response.ok){const error=await response.json();throw Error(error.error||'渲染失败');}
  const blob=await response.blob();if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=URL.createObjectURL(blob);
  image.src=blobUrl;image.hidden=false;document.getElementById('empty').hidden=true;download.href=blobUrl;download.hidden=false;status.textContent='渲染完成。可横向滚动查看，或下载 SVG。';
 }catch(error){status.textContent=error.name==='TimeoutError'?'请求超时，请稍后重试':error.message;status.className='error';}
 finally{button.disabled=false;}
});
