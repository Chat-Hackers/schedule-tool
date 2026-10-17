import { loadEnvFile } from 'node:process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { parseCSV, preview, sendToHub } from './core.mjs';
const base = path.dirname(fileURLToPath(import.meta.url));
if (fs.existsSync('.env')) loadEnvFile('.env');
const data = path.resolve(process.env.DATA_FILE || 'scheduler-data.json');
const demo = process.env.SEND_MODE !== 'live';
const token = process.env.ADMIN_TOKEN || randomUUID();
const registrationPath = path.join(path.dirname(data), 'message-scheduler.json');
const previousRegistration = fs.existsSync(registrationPath) ? JSON.parse(fs.readFileSync(registrationPath, 'utf8')) : {};
const moduleSecret = process.env.MODULE_SECRET || previousRegistration.secret || randomUUID();
const registration = {
  id: 'message-scheduler',
  uuid: previousRegistration.uuid || randomUUID(),
  url: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 5057}`,
  emoji: '⏰',
  title: 'Message Scheduler',
  description: 'Schedule organiser messages',
  introduction: 'Use the organiser dashboard to upload and schedule messages.',
  secret: moduleSecret,
  event_types: []
};
if (!demo && (!process.env.HUB_URL || !process.env.ADMIN_TOKEN)) throw Error('Live mode requires HUB_URL and ADMIN_TOKEN');
let state = fs.existsSync(data) ? JSON.parse(fs.readFileSync(data, 'utf8')) : {messages: []};
function save() { fs.writeFileSync(data + '.tmp', JSON.stringify(state, null, 2)); fs.renameSync(data + '.tmp', data); }
for (const m of state.messages) if (m.status === 'sending') { m.status = 'uncertain'; m.error = 'Server restarted during send. Check the group before scheduling a replacement.'; }
save();
function authorized(req) { const a = Buffer.from(req.headers.authorization || ''); const b = Buffer.from(`Bearer ${token}`); return a.length === b.length && timingSafeEqual(a,b); }
async function body(req) { let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 2e6) throw Error('Upload too large'); } return JSON.parse(raw || '{}'); }
const json = (res, code, obj) => { res.writeHead(code, {'Content-Type':'application/json', 'Cache-Control':'no-store'}); res.end(JSON.stringify(obj)); };
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/') || req.method === 'POST' && url.pathname === '/') {
      if (!authorized(req)) return json(res,401,{error:'Enter the organiser access token shown in the server terminal.'});
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res,200,{...state,demo,defaultRoomId:process.env.DEFAULT_ROOM_ID || ''});
      if (req.method === 'POST' && url.pathname === '/') { await body(req); return json(res,200,{success:true,response:{}}); }
      if (req.method === 'POST' && ['/api/preview','/api/queue'].includes(url.pathname)) {
        const input = await body(req); if (input.csv !== undefined) input.rows = parseCSV(input.csv);
        const messages = preview(input,state.messages);
        if (url.pathname === '/api/preview') return json(res,200,{messages});
        if (messages.some(m=>m.issues.length)) throw Error('Resolve all preview issues before enabling');
        state.messages.push(...messages.map(m=>({...m,status:'queued',mode:demo?'demo':'live',createdAt:new Date().toISOString()}))); save(); return json(res,200,{success:true});
      }
      const match = url.pathname.match(/^\/api\/messages\/([^/]+)\/(cancel|edit)$/);
      if (req.method === 'POST' && match) {
        const m = state.messages.find(m=>m.id===match[1]); if (!m) return json(res,404,{error:'Message not found'});
        if (!['queued','failed'].includes(m.status)) throw Error('Only queued or failed messages can be changed');
        if (match[2] === 'cancel') { m.status='cancelled'; save(); return json(res,200,{success:true}); }
        const changes = await body(req);
        const [updated] = preview({roomId:m.roomId,groupName:m.groupName,timezone:m.timezone,rows:[changes]},state.messages.filter(x=>x.id!==m.id));
        if(updated.issues.length) throw Error(updated.issues.join('; '));
        Object.assign(m,{message:updated.message,at:updated.at,status:'queued',error:undefined}); save(); return json(res,200,{success:true});
      }
      return json(res,404,{error:'Unknown endpoint'});
    }
    if (req.method !== 'GET') return json(res,405,{error:'Method not allowed'});
    const files = {'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
    const name = files[url.pathname]; if(!name) return json(res,404,{error:'Not found'});
    res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});
    res.end(fs.readFileSync(path.join(base,'public',name)));
  } catch(e) { json(res,400,{error:e.message}); }
});
let busy = false;
setInterval(async()=>{
  if(busy) return; busy=true;
  try {
    const due=state.messages.filter(m=>m.status==='queued' && Date.parse(m.at)<=Date.now()).sort((a,b)=>a.at.localeCompare(b.at));
    for(const m of due) {
      if(m.status!=='queued') continue;
      if(m.mode !== (demo?'demo':'live')) {m.status='failed';m.error='Send mode changed; review and reschedule';save();continue;}
      m.status='sending'; save();
      try {
        if(!demo) await sendToHub(m,{hubUrl:process.env.HUB_URL,secret:moduleSecret});
        m.status=demo?'simulated':'accepted';m.completedAt=new Date().toISOString();
      } catch(e) { m.status='uncertain'; m.error=e.message + '. No automatic retry; inspect the group before replacing.'; }
      save();
    }
  } finally {busy=false;}
},1000);
server.listen(Number(process.env.PORT || 5057),process.env.HOST || '127.0.0.1',()=>{
  fs.writeFileSync(registrationPath, JSON.stringify(registration, null, 2), { mode: 0o600 });
  console.log(`Message Scheduler: http://localhost:${process.env.PORT || 5057}\nMode: ${demo?'DEMO (no messages leave this server)':'LIVE'}\nOrganiser token: ${token}`);
  console.log('\nTool Hub registration — copy this JSON to your Hub operator:\n' + JSON.stringify(registration, null, 2));
  console.log(`Saved to ${registrationPath}`);
  if (!process.env.PUBLIC_URL) console.log('Set PUBLIC_URL to your public/tunnel URL and restart before your friend registers this with a remote Hub.');
});

