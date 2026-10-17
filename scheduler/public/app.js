const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('scheduler-token') || '', reviewed = false, messages = [], editId;
$('token').value=token;
const notice = text => $('notice').textContent=text;
async function api(route,body) { const res=await fetch(route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})}); const data=await res.json();if(!res.ok) throw Error(data.error);return data; }
function input(){return {roomId:$('room').value,groupName:$('group').value,timezone:$('zone').value,csv:$('csv').value};}
function invalidate(){reviewed=false;$('confirm').checked=false;$('enable').disabled=true;$('preview-content').replaceChildren();$('preview-content').textContent='Preview your updated schedule before enabling.';}
for(const id of ['room','group','zone','csv']) $(id).addEventListener('input',invalidate);
function renderMessage(m,actions=false){
 const node=document.createElement('article');node.className='message';
 const time=document.createElement('time');time.textContent=m.at?new Intl.DateTimeFormat('en-GB',{timeZone:m.timezone,dateStyle:'medium',timeStyle:'long'}).format(new Date(m.at)):'Invalid timestamp';node.append(time);
 if(m.status!=='draft'){const status=document.createElement('span');status.className='status';status.textContent=m.status;node.append(status);}
 const destination=document.createElement('small');destination.textContent=`${m.groupName} · ${m.roomId} · ${m.timezone}`;node.append(document.createElement('br'),destination);
 const p=document.createElement('p');p.textContent=m.message;node.append(p);
 for(const issue of [...(m.issues||[]),...(m.error?[m.error]:[])]){const err=document.createElement('p');err.className='error';err.textContent=issue;node.append(err);}
 if(actions&&['queued','failed'].includes(m.status)) for(const action of ['Edit','Cancel']){const button=document.createElement('button');button.className='secondary';button.textContent=action;button.onclick=async()=>{if(action==='Edit'){editId=m.id;$('edit-message').value=m.message;$('edit-time').value=m.at;$('edit-error').textContent='';$('editor').showModal();}else try{await api(`/api/messages/${m.id}/cancel`,{});await refresh();}catch(e){notice(e.message);}};node.append(button);}
 return node;
}
async function refresh(){const data=await api('/api/state');messages=data.messages;if(!$('room').value && data.defaultRoomId)$('room').value=data.defaultRoomId;$('mode').textContent=data.demo?'DEMO · no live sends':'LIVE · Tool Hub';$('queue').className=messages.length?'':'empty';$('queue').replaceChildren(...messages.slice().sort((a,b)=>a.at.localeCompare(b.at)).map(m=>renderMessage(m,true)));if(!messages.length)$('queue').textContent='A clear queue. Your next plan starts above.';}
$('connect').onclick=async()=>{token=$('token').value.trim();try{await refresh();sessionStorage.setItem('scheduler-token',token);notice('Connected. Ready to prepare your schedule.');}catch(e){notice(e.message);}};
$('refresh').onclick=()=>refresh().catch(e=>notice(e.message));
$('sample').onclick=()=>{const rows=[['Welcome everyone! We’re looking forward to seeing you.'],['A quick reminder: bring your laptop and your ideas.'],['Thanks for joining us. Share what you built!']];$('csv').value='timestamp,message\n'+rows.map(([m],i)=>`${new Date(Date.now()+(i+1)*60000).toISOString()},"${m}"`).join('\n');if(!$('room').value)$('room').value='!demo-test-group:matrix.campaignlab.uk';invalidate();};
$('file').onchange=async()=>{try{const file=$('file').files[0];if(!file)return;if(file.size>1e6)throw Error('Please choose a CSV under 1 MB');$('csv').value=await file.text();invalidate();}catch(e){notice(e.message);}};
$('preview').onclick=async()=>{try{const data=await api('/api/preview',input());$('preview-content').className='';$('preview-content').replaceChildren(...data.messages.map(m=>renderMessage(m)));reviewed=data.messages.every(m=>!m.issues.length);$('confirm').checked=false;$('enable').disabled=true;notice(reviewed?`${data.messages.length} messages ready for review.`:'Resolve the highlighted issues, then preview again.');}catch(e){invalidate();notice(e.message);}};
$('confirm').onchange=()=>{$('enable').disabled=!reviewed||!$('confirm').checked;};
$('enable').onclick=async()=>{ $('enable').disabled=true;try{await api('/api/queue',input());invalidate();$('csv').value='';notice('Schedule enabled. Your queue will update as messages are processed.');await refresh();}catch(e){invalidate();notice(e.message);}};
$('close-edit').onclick=()=>$('editor').close();
$('edit-form').onsubmit=async e=>{e.preventDefault();try{await api(`/api/messages/${editId}/edit`,{message:$('edit-message').value,timestamp:$('edit-time').value});$('editor').close();await refresh();}catch(e){$('edit-error').textContent=e.message;}};
if(token)refresh().catch(e=>notice(e.message));
setInterval(()=>{if(token)refresh().catch(e=>notice(e.message));},5000);
