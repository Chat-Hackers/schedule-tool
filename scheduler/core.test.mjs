import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,preview,sendToHub} from './core.mjs';
const input={roomId:'!test:example.org',groupName:'Test',timezone:'Europe/London',rows:[{message:'Hello',timestamp:'2099-10-17T18:00:00+01:00'}]};
test('CSV supports BOM, commas, quotes and multiline messages',()=>{
 assert.deepEqual(parseCSV('\uFEFFtimestamp,message\r\n2099-10-17T18:00:00Z,"Hello, ""team""\nWelcome"'),[{timestamp:'2099-10-17T18:00:00Z',message:'Hello, "team"\nWelcome'}]);
 assert.throws(()=>parseCSV('message,timestamp\n"unfinished'));
});
test('timestamps require explicit offsets, reject past and sort chronologically',()=>{
 assert.equal(preview(input)[0].at,'2099-10-17T17:00:00.000Z');
 for(const timestamp of ['2099-10-17T18:00','bad','2000-01-01T00:00:00Z']) assert.ok(preview({...input,rows:[{message:'Hi',timestamp}]})[0].issues.length);
 assert.throws(()=>preview({...input,timezone:'invalid'}));
});
test('duplicates blocked within upload and across queue; cancelled records permit replacement',()=>{
 const first=preview(input)[0];
 assert.ok(preview({...input,rows:[...input.rows,...input.rows]})[1].issues.includes('Duplicate destination, message and send time'));
 assert.ok(preview(input,[{...first,status:'accepted'}])[0].issues.length);
 assert.equal(preview(input,[{...first,status:'cancelled'}])[0].issues.length,0);
});
test('Hub HTTP 200 with success false is a failure',async()=>{
 const old=global.fetch;global.fetch=async()=>({ok:true,json:async()=>({success:false,message:'module is not active in this room'})});
 try{await assert.rejects(sendToHub({...input.rows[0],roomId:input.roomId},{hubUrl:'https://example.org',secret:'test'}),/not active/);}finally{global.fetch=old;}
});
