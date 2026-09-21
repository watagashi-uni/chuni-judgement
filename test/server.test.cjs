const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {createServer}=require('../server');
const chart='BPM_DEF\t170.5\nMET_DEF\t4\t4\nTAP\t0\t0\t0\t4\nCHR\t1\t0\t4\t4\n';
test('standalone upload, parameter preview, plain preview and path confinement',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'chuni-test-'));const server=createServer({chartDir:dir});
 await fs.writeFile(path.join(dir,'1086_03.c2s'),chart);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});});
 assert.equal((await fetch(base+'/healthz')).status,200);
 const upload=await fetch(base+'/api/render',{method:'POST',body:chart});assert.equal(upload.status,200);assert.match(await upload.text(),/<svg/);
 const preview=await fetch(base+'/preview?name=1086_03');assert.equal(preview.status,200);const html=await preview.text();assert.match(html,/chuni-judgement-render/);assert.match(html,/AGPL-3.0/);assert.match(html,/JUSTICE CRITICAL/);
 const plain=await(await fetch(base+'/preview?name=1086_03&judge=0')).text();assert.ok(!plain.includes('JUSTICE CRITICAL'));
 assert.equal((await fetch(base+'/preview?name=9999_03')).status,404);
 assert.equal((await fetch(base+'/preview?name=..%2Fsecret')).status,400);
 await fs.symlink('/etc/passwd',path.join(dir,'0001_03.c2s'));assert.equal((await fetch(base+'/preview?name=0001_03')).status,404);
 assert.equal((await fetch(base+'/api/render',{method:'POST',body:'invalid!'})).status,400);
 assert.equal((await fetch(base+'/api/render',{method:'POST',body:'x'.repeat(2*1024*1024+1)})).status,413);
});
