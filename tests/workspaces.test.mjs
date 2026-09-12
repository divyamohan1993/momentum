import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceFor, workspaceKey, ownsRecord, allowedPushEndpoint } from '../lib/workspace-policy.ts';
import { encryptField, decryptField } from '../lib/field-cipher.ts';
import { tasksCsv, tasksCalendar } from '../lib/data-portability.ts';
import { nextOccurrence } from '../lib/recurrence.ts';
import { dateInput, parseDateInput } from '../lib/time.ts';
import { Task } from '../lib/types.ts';
const task=Task.parse({id:'d89ae3f7-e307-4e17-ad9f-8ebecbe7d979',ownerId:'alice',title:'Plan',createdAt:'2026-09-12T00:00:00.000Z',updatedAt:'2026-09-12T00:00:00.000Z'});
test('workspace keys isolate identities and preserve only the pinned legacy account',()=>{
 const a=workspaceFor('alice','legacy','owner@example.test'),b=workspaceFor('bob','legacy','owner@example.test');
 assert.notEqual(a,b);assert.notEqual(workspaceKey(a),workspaceKey(b));
 assert.equal(workspaceFor('legacy','legacy','owner@example.test'),'owner@example.test');
 assert.notEqual(workspaceFor('owner@example.test','legacy','owner@example.test'),'owner@example.test');
 assert.equal(ownsRecord(a,{ownerId:b}),false);
});
test('ciphertexts cannot move across workspace boundaries',()=>{
 const master=Buffer.alloc(32,42),cipher=encryptField('Alice private note',master,'alice');
 assert.equal(decryptField(cipher,master,'alice'),'Alice private note');
 assert.throws(()=>decryptField(cipher,master,'bob'));
 assert.throws(()=>decryptField('legacy plaintext',master,'bob'));
 assert.equal(decryptField('legacy plaintext',master,'legacy',true),'legacy plaintext');
});
test('only supported HTTPS push service endpoints are accepted',()=>{
 assert.equal(allowedPushEndpoint('https://fcm.googleapis.com/fcm/send/fixture'),true);
 assert.equal(allowedPushEndpoint('http://127.0.0.1/'),false);
 assert.equal(allowedPushEndpoint('https://fcm.googleapis.com.attacker.test/'),false);
 assert.equal(allowedPushEndpoint('https://user:pass@fcm.googleapis.com/path'),false);
 assert.equal(allowedPushEndpoint('https://fcm.googleapis.com:8443/path'),false);
});
test('CSV cells are quoted and spreadsheet formulas are inert',()=>{
 const csv=tasksCsv([{...task,title:'=1+1',description:'a,"b"\nnext'}],[]);
 assert.ok(csv.includes('"\'=1+1"'));assert.ok(csv.includes('"a,""b""\nnext"'));
});
test('calendar exports escape user text and produce bounded lines',()=>{
 const text=tasksCalendar([{...task,title:'Plan\nEND:VEVENT',description:'語'.repeat(100),dueAt:'2026-10-01T09:00:00.000Z'}]);
 assert.equal(text.split('\r\nEND:VEVENT\r\n').length-1,1);
 assert.ok(text.includes('SUMMARY:Plan\\nEND:VEVENT'));
 assert.ok(text.split('\r\n').every(l=>Buffer.byteLength(l)<=75));
});
test('daily recurrences preserve local time through daylight saving',()=>{
 assert.equal(nextOccurrence({every:'day',interval:1},'2026-03-07T14:00:00.000Z','America/New_York'),'2026-03-08T13:00:00.000Z');
});
test('monthly recurrence preserves month-end anchor',()=>{
 assert.equal(nextOccurrence({every:'month',interval:1,dayOfMonth:31},'2026-01-31T09:00:00.000Z','UTC'),'2026-02-28T09:00:00.000Z');
 assert.equal(nextOccurrence({every:'month',interval:1,dayOfMonth:31},'2026-02-28T09:00:00.000Z','UTC'),'2026-03-31T09:00:00.000Z');
});
test('weekly interval is respected with selected weekdays',()=>{
 assert.equal(nextOccurrence({every:'week',interval:2,daysOfWeek:[1]},'2026-09-07T09:00:00.000Z','UTC'),'2026-09-21T09:00:00.000Z');
});
test('deadline editor round-trips the workspace timezone',()=>{
 const iso='2026-09-12T10:00:00.000Z';
 assert.equal(dateInput(iso,'Asia/Tokyo'),'2026-09-12T19:00');
 assert.equal(parseDateInput('2026-09-12T19:00','Asia/Tokyo'),iso);
});

test('AI board context is bounded and declares omitted cards', async()=>{
 const {boardContext}=await import('../lib/brain-context.ts');
 const tasks=Array.from({length:500},(_,i)=>({id:String(i),title:'語'.repeat(300),status:'todo'}));
 const text=boardContext('What is next?',tasks),p=JSON.parse(text);
 assert.ok(Buffer.byteLength(text)<=12000);assert.ok(p.omitted>0);assert.equal(p.stats.total,500);
});
