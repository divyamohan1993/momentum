import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { randomUUID, createCipheriv, randomBytes, createHash, createECDH, createHmac } from 'node:crypto';
import { SignJWT } from "jose";
import { deviceMatchesWorkspace } from "../lib/workspace-policy.ts";
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// This test deliberately refuses any non-local data service. No production identities/data.
const project='demo-momentum';
const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const firestoreHost=process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
for(const host of [authHost,firestoreHost])assert.match(host,/^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_AUTH_EMULATOR_HOST=authHost;process.env.FIRESTORE_EMULATOR_HOST=firestoreHost;
const external=process.env.MOMENTUM_TEST_SERVER_EXTERNAL==='1';
const port=external?3100:3200,origin=`http://localhost:${port}`;
const master=Buffer.alloc(32,42),sessionSecret='local-emulator-only-session-key-0123456789';
const db=getFirestore(initializeApp({projectId:project},'workspace-integration'));
db.settings({host:firestoreHost,ssl:false,ignoreUndefinedProperties:true});
const hash=(s)=>createHash('sha256').update(s).digest('hex');
function legacyCipher(text){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',master,iv);const data=Buffer.concat([c.update(text),c.final()]);return 'v1:'+Buffer.concat([iv,c.getAuthTag(),data]).toString('base64url');}
async function idp(name){
 const now=Math.floor(Date.now()/1000),p={sub:name+'-google',email:name+'@example.test',email_verified:true,name:name==='alice'?'Alice':'Bob',iss:'https://accounts.google.com',aud:'demo-client',iat:now,exp:now+3600};
 const token=Buffer.from('{"alg":"none"}').toString('base64url')+'.'+Buffer.from(JSON.stringify(p)).toString('base64url')+'.';
 const r=await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({postBody:new URLSearchParams({id_token:token,providerId:'google.com'}).toString(),requestUri:'http://localhost',returnSecureToken:true})});
 const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;
}
const firstAlice=await idp('alice'),firstBob=await idp('bob');
for(const collection of ['tasks','reminders','meta','workspaces','sessions','devices','audit'])await db.recursiveDelete(db.collection('momentum_'+collection));
const legacyId=randomUUID();
await db.collection('momentum_tasks').doc(legacyId).set({ownerId:'alice@example.test',title:legacyCipher('Alice legacy task'),description:legacyCipher('Legacy private note'),status:'todo',priority:'med',tags:['legacy'],deletedAt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
await db.collection('momentum_meta').doc('version').set({v:7});
let server;
if(!external){
 server=spawn('pnpm',['exec','next','dev','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,NODE_ENV:'development',MOMENTUM_TEST_DIST_DIR:'.next-workspace-test',GCP_PROJECT:project,OWNER_EMAIL:'alice@example.test',OWNER_GOOGLE_UID:firstAlice.localId,OWNER_GOOGLE_SUB:'alice-google',SESSION_SECRET:sessionSecret,FIELD_KEY:master.toString('base64'),FIREBASE_API_KEY:'demo-key',FIREBASE_APP_ID:'demo-app',APP_ORIGIN:origin,APP_BASE_URL:'',SWEEP_INVOKER_SA:'',SWEEP_AUDIENCE:'',GEMINI_DAILY_CAP:'0',GEMINI_USER_DAILY_CAP:'10',VAPID_PUBLIC_KEY:'',VAPID_PRIVATE_KEY:''},detached:true,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',()=>{});server.stderr.on('data',()=>{});
}
let checks=0;
function ok(condition,message){assert.ok(condition,message);checks++;}
class Client {
 cookies=new Map();
 async call(path,body,method=body===undefined?'GET':'POST'){
  const r=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json',cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ')},body:body===undefined?undefined:JSON.stringify(body)});
  for(const cookie of r.headers.getSetCookie()){const first=cookie.split(';')[0],index=first.indexOf('='),name=first.slice(0,index),value=first.slice(index+1);if(value)this.cookies.set(name,value);else this.cookies.delete(name);}
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}
  return {status:r.status,data,headers:r.headers};
 }
 async login(name){
  const token=await idp(name),proof=await this.call('/api/auth/google/challenge',{});assert.equal(proof.status,200,JSON.stringify(proof.data));
  const r=await this.call('/api/auth/google',{idToken:token.idToken,csrf:proof.data.csrf,timeZone:name==='alice'?'America/New_York':'Asia/Tokyo'});
  assert.equal(r.status,200,JSON.stringify(r.data));this.lastIdToken=token.idToken;return token;
 }
 clone(){const c=new Client();c.cookies=new Map(this.cookies);return c;}
}
try{
 for(let i=0;i<90;i++){try{if((await fetch(origin+'/api/health')).ok)break;}catch{}if(i===89)throw Error('Test app did not start');await new Promise(r=>setTimeout(r,500));}
 const alice=new Client(),bob=new Client();await alice.login('alice');await bob.login('bob');
 let a=await alice.call('/api/board'),b=await bob.call('/api/board');
 ok(a.status===200&&a.data.profile.uid===firstAlice.localId,`Alice session failed: ${a.status} ${JSON.stringify(a.data).slice(0,180)} cookies=${[...alice.cookies.keys()].join(',')}`);
 ok(b.status===200&&b.data.profile.uid===firstBob.localId,'Bob session failed');
 ok(a.data.tasks.some(t=>t.id===legacyId&&t.title==='Alice legacy task'),'Legacy task not preserved');
 ok(b.data.tasks.length===0,'Bob saw legacy owner data');
 ok(a.data.profile.timeZone==='Asia/Kolkata'&&b.data.profile.timeZone==='Asia/Tokyo','Timezone isolation failed');
 const projectId=randomUUID();
 const projectResponse=await alice.call('/api/workspace',{timeZone:'America/New_York',projects:[{id:projectId,name:'Alice project',color:'sky'}]},'PATCH');ok(projectResponse.status===200,'Project creation failed: '+projectResponse.status+' '+JSON.stringify(projectResponse.data).slice(0,180));
 ok((await bob.call('/api/workspace')).data.profile.projects.length===0,'Project leaked');
 const created=await alice.call('/api/tasks',{title:'Alice secret',description:'Only Alice should see this',projectId,ownerId:'forged-owner'});assert.equal(created.status,200,JSON.stringify(created.data));const taskA=created.data.task;
 const madeBob=await bob.call('/api/tasks',{title:'Bob private',description:'Only Bob'});assert.equal(madeBob.status,200);const taskB=madeBob.data.task;
 ok(taskA.ownerId==='alice@example.test','Client reassigned task owner');
 ok(taskB.ownerId!==taskA.ownerId,'Workspaces share an owner key');
 ok((await bob.call('/api/tasks',{title:'Wrong project',projectId})).status===400,'Foreign project accepted');
 ok((await bob.call('/api/tasks',{id:taskA.id,patch:{title:'Not allowed'}},'PATCH')).status===404,'Cross-user edit accepted');
 ok((await bob.call('/api/tasks',{id:taskA.id},'DELETE')).status===404,'Cross-user deletion accepted');
 ok((await bob.call('/api/decompose',{taskId:taskA.id})).status===404,'Cross-user AI context accepted');
 ok((await bob.call('/api/triage',{taskId:taskA.id})).status===404,'Cross-user triage accepted');
 ok((await bob.call('/api/fire',{taskId:taskA.id})).status===404,'Cross-user reminder accepted');
 ok((await alice.call('/api/tasks',{id:taskA.id,patch:{ownerId:taskB.ownerId}},'PATCH')).status===400,'Owner patch accepted');
 const exported=await alice.call('/api/workspace/export');
 ok(exported.data.tasks.some(t=>t.id===taskA.id)&&!exported.data.tasks.some(t=>t.id===taskB.id),'Export crossed workspaces');
 ok(!JSON.stringify(exported.data).includes('googleSub')&&!JSON.stringify(exported.data).includes('refreshToken'),'Export leaked identity credentials');
 const imp=await bob.call('/api/workspace/import',exported.data);ok(imp.status===200&&imp.data.count===exported.data.tasks.length,'Import failed');
 b=await bob.call('/api/board');
 ok(b.data.tasks.every(t=>t.ownerId===taskB.ownerId),'Import retained foreign owners');
 ok(!b.data.tasks.some(t=>t.id===taskA.id),'Import retained foreign task IDs');
 ok(b.data.tasks.filter(t=>t.id!==taskB.id).every(t=>t.remindersEnabled===false),'Import unexpectedly armed reminders');
 ok(b.data.profile.projects.some(p=>p.name==='Alice project'&&p.id!==projectId),'Project import did not remap IDs');
 const disposable=await bob.call('/api/tasks',{title:'Remove my data'});ok((await bob.call('/api/tasks',{id:disposable.data.task.id},'DELETE')).status===200,'Own deletion failed');
 ok(!(await db.collection('momentum_tasks').doc(disposable.data.task.id).get()).exists,'Deleted task data was retained');
 const before=(await bob.call('/api/board')).data.tasks.length;
 ok((await bob.call('/api/workspace/import',{tasks:[{title:'valid'}, {title:''}]})).status===400,'Invalid import accepted');
 ok((await bob.call('/api/board')).data.tasks.length===before,'Invalid import partially wrote data');
 const recurring=await alice.call('/api/tasks',{title:'Repeat safely',dueAt:'2027-01-31T14:00:00.000Z',recurrence:{every:'month',interval:1},remindersEnabled:false});assert.equal(recurring.status,200);
 const rId=recurring.data.task.id;
 const done=await Promise.all([alice.call('/api/tasks',{id:rId,patch:{status:'done'}},'PATCH'),alice.call('/api/tasks',{id:rId,patch:{status:'done'}},'PATCH')]);ok(done.every(r=>r.status===200),'Concurrent completion failed');
 a=await alice.call('/api/board');ok(a.data.tasks.filter(t=>t.title==='Repeat safely').length===2,'Recurring completion duplicated the next occurrence');
 const fb=await bob.call('/api/capture',{text:'Bob fallback one\nBob fallback two'});ok(fb.status===200&&fb.data.degraded&&fb.data.count===2,'Manual fail-safe failed');
 a=await alice.call('/api/board');ok(!a.data.tasks.some(t=>t.title.startsWith('Bob fallback')),'Capture leaked to Alice');
 const rawA=(await db.collection('momentum_tasks').doc(taskA.id).get()).data(),rawB=(await db.collection('momentum_tasks').doc(taskB.id).get()).data();
 ok(rawA.title.startsWith('v2:')&&rawB.title.startsWith('v2:'),'New task fields are not encrypted');
 const direct=await fetch(`http://${firestoreHost}/v1/projects/${project}/databases/(default)/documents/momentum_tasks/${taskA.id}`,{headers:{Authorization:'Bearer '+bob.lastIdToken}});
 ok(direct.status===403,'Browser token bypassed Firestore rules');
 const proof=await bob.call('/api/auth/google/challenge',{});
 ok((await bob.call('/api/auth/google',{idToken:bob.lastIdToken,csrf:proof.data.csrf})).status===401,'Identity token exchange replay accepted');
 const ecdh=createECDH('prime256v1');ecdh.generateKeys();
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/demo-alice',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
 ok((await alice.call('/api/push/subscribe',{subscription})).status===200,'Push registration failed');
 ok((await bob.call('/api/board')).data.notificationsEnabled===false,'Notification subscription leaked');
 ok((await bob.call('/api/push/subscribe',{subscription:{...subscription,endpoint:'http://127.0.0.1/metadata'}})).status===400,'Unsafe push destination accepted');
 const key=createHmac('sha256',sessionSecret).update('momentum:notification-actions:v2').digest();
 const tokenFor=async(owner,id)=>new SignJWT({sub:owner,t:id,k:'action'}).setProtectedHeader({alg:'HS256'}).setIssuer('momentum:notification-actions').setAudience('momentum:notification-actions').setIssuedAt().setExpirationTime('1h').sign(key);
 const wrongCapability=await tokenFor(taskB.ownerId,taskA.id);
 ok((await bob.call('/api/reminders/action',{taskId:taskA.id,action:'done',token:wrongCapability})).status===404,'Notification capability crossed accounts');
 const oldCapability=await tokenFor(taskA.ownerId,taskA.id);
 const aliceDeviceHash=createHash('sha256').update(alice.cookies.get('__Host-momentum_device')).digest('base64url');
 const aliceOld=alice.clone();await alice.login('bob');
 const binding=(await db.collection('momentum_devices').doc(aliceDeviceHash).get()).data();
 ok(!deviceMatchesWorkspace(taskA.ownerId,binding)&&deviceMatchesWorkspace(taskB.ownerId,binding),'Old account remained eligible for device notifications');
 ok((await alice.call('/api/reminders/action',{taskId:taskA.id,action:'done',token:oldCapability})).status===401,'Old notification remained usable after switching accounts');
 ok((await aliceOld.call('/api/board')).status===401,'Account switch left old device session usable');
 ok((await alice.call('/api/board')).data.profile.uid===firstBob.localId,'Account switch did not select Bob');
 ok((await bob.call('/api/board')).status===200,'Account switch broke Bob on another device');
 const old=bob.clone();ok((await bob.call('/api/auth/logout',{})).status===200,'Logout failed');
 ok((await old.call('/api/board')).status===401,'Logged-out credential remained usable');
 // Optional state for local visual verification; emulator identities only.
 if(process.env.MOMENTUM_TEST_BROWSER_STATE){
  const state={cookies:[...alice.cookies].map(([name,value])=>({name,value,domain:'localhost',path:'/',httpOnly:true,secure:true,sameSite:'Strict',expires:Math.floor(Date.now()/1000)+3600})),origins:[]};
  writeFileSync(process.env.MOMENTUM_TEST_BROWSER_STATE,JSON.stringify(state),{mode:0o600});
 }
 console.log(`Workspace integration: ${checks} checks passed (two isolated emulator accounts).`);
 if(process.env.MOMENTUM_TEST_READY_FILE) writeFileSync(process.env.MOMENTUM_TEST_READY_FILE,"ready");
 if(process.env.MOMENTUM_TEST_PAUSE_FOR_BROWSER === "1") {
   for(let i=0;i<180;i++){if(process.env.MOMENTUM_TEST_DONE_FILE && (await import("node:fs")).existsSync(process.env.MOMENTUM_TEST_DONE_FILE))break;await new Promise(resolve=>setTimeout(resolve,1000));}
 }
} finally {
 if(server){try{process.kill(-server.pid,'SIGTERM');}catch{}await new Promise(resolve=>{server.once('exit',resolve);setTimeout(resolve,3000);});}
 await db.terminate();
}
