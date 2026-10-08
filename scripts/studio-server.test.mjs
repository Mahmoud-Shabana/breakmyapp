import {spawn} from 'node:child_process';
import {once} from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';

test('Studio serves only local CSP-protected assets',async()=>{
 const port=43981;
 const child=spawn(process.execPath,[new URL('./studio-server.mjs',import.meta.url).pathname],{
  env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']
 });
 try{
  await Promise.race([once(child.stdout,'data'),
   new Promise((_,reject)=>setTimeout(()=>reject(Error('Server startup timeout')),3000))]);
  const root='http://127.0.0.1:'+port;
  for(const path of ['/','/style.css','/studio.js','/analysis.mjs']){
   const res=await fetch(root+path);
   assert.equal(res.status,200,path);
   assert.match(res.headers.get('content-security-policy'),/connect-src 'none'/);
   assert.ok((await res.text()).length>100);
  }
  const missing=await fetch(root+'/does-not-exist');
  assert.equal(missing.status,404);
  const post=await fetch(root,{method:'POST'});
  assert.equal(post.status,405);
 }finally{child.kill('SIGTERM');}
});
