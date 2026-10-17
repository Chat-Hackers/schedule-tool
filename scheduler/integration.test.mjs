import { spawn } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

test('demo API previews, edits, cancels, processes and persists with access control',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scheduler-test-'));
 const child=spawn(process.execPath,['scheduler/server.mjs'],{env:{...process.env,PORT:'15057',ADMIN_TOKEN:'integration-test',SEND_MODE:'demo',DATA_FILE:path.join(dir,'data.json')},stdio:'pipe'});
 child.stderr.on('data',chunk=>process.stderr.write(chunk));
 const call=async(route,body,auth=true)=>{const res=await fetch('http://127.0.0.1:15057'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer integration-test'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};};
 try{
  let ready=false;for(let i=0;i<40;i++){try{await call('/api/state');ready=true;break;}catch{await delay(100);}}assert.ok(ready);
  assert.equal((await call('/api/state',null,false)).status,401);
  const input={roomId:'!test:example.org',groupName:'Test',timezone:'Europe/London',rows:[1,2,3].map((n)=>({message:'Message '+n,timestamp:new Date(Date.now()+3000).toISOString()}))};
  assert.equal((await call('/api/preview',input)).data.messages.length,3);
  assert.equal((await call('/api/queue',input)).status,200);
  assert.equal((await call('/api/queue',input)).status,400);
  let messages=(await call('/api/state')).data.messages;
  assert.equal((await call('/api/messages/'+messages[0].id+'/edit',{message:'Edited',timestamp:new Date(Date.now()+3000).toISOString()})).status,200);
  assert.equal((await call('/api/messages/'+messages[1].id+'/cancel',{})).status,200);
  await delay(4500);
  messages=(await call('/api/state')).data.messages;
  assert.deepEqual(messages.map(m=>m.status),['simulated','cancelled','simulated']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'data.json'))).messages[0].message,'Edited');
 }finally{if(child.exitCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}fs.rmSync(dir,{recursive:true,force:true});}
});


