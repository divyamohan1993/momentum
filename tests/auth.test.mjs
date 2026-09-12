import test from 'node:test';
import assert from 'node:assert/strict';
import { googleIdentityAllowed, originAllowed, sessionAllowed, SESSION_COOKIE, SESSION_SECONDS } from '../lib/auth-policy.ts';
import { createLoginProof, verifyLoginProof, createSessionCredential, validSessionCredential, createDeviceCredential, validDeviceCredential, opaqueToken, tokenHash } from '../lib/login-proof.ts';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const project = 'test-project', now = 1_800_000_000;
const claims = (uid = 'alice') => ({ aud: project, iss: `https://securetoken.google.com/${project}`, sub: uid, uid, email: uid+'@example.test', email_verified: true, auth_time: now, iat: now, exp: now+3600, firebase: { sign_in_provider: 'google.com', identities: { 'google.com': [uid+'-google'] } } });
test('separate verified Google users may sign in', () => {
  assert.equal(googleIdentityAllowed(claims('alice'), project, now), true);
  assert.equal(googleIdentityAllowed(claims('bob'), project, now), true);
});
for (const [name, mutate] of [
  ['wrong audience', p => p.aud='other-project'], ['wrong issuer', p=>p.iss='https://example.test'],
  ['mismatched UID',p=>p.sub='other'], ['empty UID',p=>p.uid=''], ['unverified email',p=>p.email_verified=false],
  ['string verification flag',p=>p.email_verified='true'], ['custom tokens',p=>p.firebase.sign_in_provider='custom'],
  ['password tokens',p=>p.firebase.sign_in_provider='password'], ['anonymous tokens',p=>p.firebase.sign_in_provider='anonymous'],
  ['missing Google identity',p=>p.firebase.identities={}], ['tenant token',p=>p.firebase.tenant='other'],
  ['old authentication',p=>p.auth_time=now-301], ['old issuance',p=>p.iat=now-301], ['expiry',p=>p.exp=now-1], ['future token',p=>p.iat=now+60],
]) test(`rejects ${name}`,()=>{const p=claims();mutate(p);assert.equal(googleIdentityAllowed(p,project,now),false);});
test('origin cannot be overridden by Fetch Metadata or host hints',()=>{
 const origin='https://momentum.example.test';
 for(const headers of [{},{origin:'https://other.example.test','sec-fetch-site':'same-origin'},{origin:'null'},{origin,'sec-fetch-site':'same-site'}])assert.equal(originAllowed(new Request(origin,{method:'POST',headers}),origin),false);
 assert.equal(originAllowed(new Request(origin,{method:'POST',headers:{origin,'sec-fetch-site':'same-origin'}}),origin),true);
});
test('CSRF proof checks browser nonce, MAC and expiry',()=>{
 const p=createLoginProof('fixture-key',now);
 assert.equal(verifyLoginProof(p.cookie,p.nonce,'fixture-key',now+100),true);
 assert.equal(verifyLoginProof(p.cookie,opaqueToken(),'fixture-key',now),false);
 assert.equal(verifyLoginProof(p.cookie,p.nonce,'wrong-key',now),false);
 assert.equal(verifyLoginProof(p.cookie,p.nonce,'fixture-key',now+300001),false);
});
test('session and device credentials are opaque and purpose-separated',()=>{
 const s=createSessionCredential('key'),d=createDeviceCredential('key');
 assert.equal(validSessionCredential(s,'key'),true);assert.equal(validDeviceCredential(d,'key'),true);
 assert.equal(validSessionCredential(d,'key'),false);assert.equal(validDeviceCredential(s,'key'),false);
 assert.equal(validSessionCredential(s+'x','key'),false);assert.equal(validSessionCredential(s,'different'),false);
 assert.notEqual(tokenHash(s),s);assert.ok(SESSION_COOKIE.startsWith('__Host-'));
});
test('session expiry and account binding fail closed',()=>{
 const s={hash:tokenHash('fixture'),uid:'alice',createdAt:now,expiresAt:now+SESSION_SECONDS*1000,authTime:Math.floor(now/1000)};
 assert.equal(sessionAllowed(s,'alice',now),true);assert.equal(sessionAllowed(s,'bob',now),false);
 assert.equal(sessionAllowed(s,'alice',s.expiresAt),false);assert.equal(sessionAllowed(undefined,'alice',now),false);
});
test('unsigned identity claims fail cryptographic verification',async()=>{
 const app=initializeApp({projectId:project},'auth-unit-test');
 const token=Buffer.from('{"alg":"none"}').toString('base64url')+'.'+Buffer.from(JSON.stringify(claims())).toString('base64url')+'.';
 await assert.rejects(getAuth(app).verifyIdToken(token),/kid|algorithm|signature|token/i);
});
