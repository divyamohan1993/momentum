import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerIdentityAllowed, originAllowed, sessionAllowed, SESSION_COOKIE, SESSION_SECONDS } from '../lib/auth-policy.ts';
import { createLoginProof, verifyLoginProof, opaqueToken, tokenHash } from '../lib/login-proof.ts';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const owner = { email: 'owner@example.test', uid: 'owner-fixture', googleSub: 'google-owner-fixture', project: 'test-project' };
const now = 1_800_000_000;
const claims = () => ({ aud: owner.project, iss: `https://securetoken.google.com/${owner.project}`, sub: owner.uid, uid: owner.uid, email: owner.email, email_verified: true, auth_time: now, iat: now, exp: now + 3600, firebase: { sign_in_provider: 'google.com', identities: { 'google.com': [owner.googleSub] } } });

test('only the fully pinned, recent Google identity is authorized', () => assert.equal(ownerIdentityAllowed(claims(), owner, now), true));
for (const [name, mutate] of [
  ['different project', p => p.aud = 'different-project'],
  ['different issuer', p => p.iss = 'https://example.test'],
  ['different UID', p => p.uid = 'other-user'],
  ['different subject', p => p.sub = 'other-user'],
  ['different email', p => p.email = 'other@example.test'],
  ['unverified email', p => p.email_verified = false],
  ['string verification flag', p => p.email_verified = 'true'],
  ['custom-token sign-in', p => p.firebase.sign_in_provider = 'custom'],
  ['password sign-in', p => p.firebase.sign_in_provider = 'password'],
  ['anonymous sign-in', p => p.firebase.sign_in_provider = 'anonymous'],
  ['different Google identity', p => p.firebase.identities['google.com'] = ['other-google-user']],
  ['tenant identity', p => p.firebase.tenant = 'other-tenant'],
  ['old authentication', p => p.auth_time = now - 301],
  ['old token', p => p.iat = now - 301],
  ['expired token', p => p.exp = now - 1],
  ['future token', p => p.iat = now + 60],
]) test(`denies ${name}`, () => { const p = claims(); mutate(p); assert.equal(ownerIdentityAllowed(p, owner, now), false); });

test('missing pinned owner identity fails closed', () => assert.equal(ownerIdentityAllowed(claims(), { ...owner, googleSub: '' }, now), false));

test('exact origin is required, regardless of host or Fetch Metadata claims', () => {
  const url = 'https://momentum.example.test';
  for (const headers of [{}, { origin: 'https://evil.example.test', 'sec-fetch-site': 'same-origin' }, { origin: 'http://momentum.example.test' }, { origin: url, 'sec-fetch-site': 'same-site' }, { origin: 'null' }]) {
    assert.equal(originAllowed(new Request(url, { method: 'POST', headers }), url), false);
  }
  assert.equal(originAllowed(new Request(url, { method: 'POST', headers: { origin: url, 'sec-fetch-site': 'same-origin' } }), url), true);
});

test('CSRF proof is authenticated, browser-bound and expires in five minutes', () => {
  const { nonce, cookie } = createLoginProof('test-secret', now);
  assert.equal(verifyLoginProof(cookie, nonce, 'test-secret', now + 100), true);
  for (const [proof, csrf, key, at] of [[cookie, opaqueToken(), 'test-secret', now], [cookie, nonce, 'other-key', now], [cookie + 'x', nonce, 'test-secret', now], [undefined, nonce, 'test-secret', now], [cookie, nonce, 'test-secret', now + 300001], [cookie, nonce, 'test-secret', now - 1]]) {
    assert.equal(verifyLoginProof(proof, csrf, key, at), false);
  }
});

test('session credentials are opaque and only their hashes are stored', () => {
  const token = opaqueToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(tokenHash(token), token);
  assert.notEqual(opaqueToken(), token);
  assert.ok(SESSION_COOKIE.startsWith('__Host-'));
});

test('session expiry and owner binding fail closed', () => {
  const s = { hash: tokenHash('fixture'), uid: owner.uid, createdAt: now, expiresAt: now + SESSION_SECONDS * 1000, authTime: Math.floor(now / 1000) };
  assert.equal(sessionAllowed(s, owner.uid, now + 1), true);
  assert.equal(sessionAllowed(s, 'other-owner', now + 1), false);
  assert.equal(sessionAllowed(undefined, owner.uid, now), false);
  assert.equal(sessionAllowed(s, owner.uid, s.expiresAt), false);
  assert.equal(sessionAllowed({ ...s, expiresAt: now + 999999999 }, owner.uid, now), false);
  assert.equal(sessionAllowed({ ...s, authTime: Math.floor(now / 1000) + 60 }, owner.uid, now), false);
});

test('Google verifier rejects an unsigned identity claim before authorization', async () => {
  const app = initializeApp({ projectId: owner.project }, 'auth-unit-test');
  const token = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(claims())).toString('base64url') + '.';
  await assert.rejects(getAuth(app).verifyIdToken(token), /kid|algorithm|signature|token/i);
});
