import test from 'node:test';
import assert from 'node:assert/strict';
import { vertexGenerate, MAX_OUTPUT_TOKENS } from '../lib/vertex.ts';
import { readBrainBody } from '../lib/brain-request.ts';
import { CaptureResult, AssistantResult } from '../lib/types.ts';

const ok = () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] });
function harness(responses = [ok()]) {
  const state = { reserved: 0, requests: [] };
  const deps = {
    project: 'dmjone', token: async () => 'test-token',
    reserve: async () => { state.reserved++; return { allowed: true }; },
    sleep: async () => {},
    fetch: async (url, init) => { state.requests.push({ url, init }); return responses.shift(); },
  };
  return { state, deps };
}

test('fixed Vertex endpoint, bearer auth and bounded generation without tools', async () => {
  const { state, deps } = harness();
  assert.equal(await vertexGenerate('system', 'user', deps), '{"ok":true}');
  const { url, init } = state.requests[0];
  assert.equal(url, 'https://aiplatform.googleapis.com/v1/projects/dmjone/locations/global/publishers/google/models/gemini-2.5-flash-lite:generateContent');
  assert.equal(init.headers.Authorization, 'Bearer test-token');
  assert.equal(init.redirect, 'error');
  const body = JSON.parse(init.body);
  assert.equal(body.generationConfig.maxOutputTokens, MAX_OUTPUT_TOKENS);
  assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.equal(body.tools, undefined);
  assert.equal(state.reserved, 1);
});

test('each transient retry consumes another reservation', async () => {
  const { state, deps } = harness([new Response('', { status: 503 }), ok()]);
  await vertexGenerate('system', 'user', deps);
  assert.equal(state.reserved, 2);
  assert.equal(state.requests.length, 2);
});

test('cap blocks a retry before a second request', async () => {
  const { state, deps } = harness([new Response('', { status: 503 }), ok()]);
  deps.reserve = async () => ({ allowed: ++state.reserved <= 1 });
  await assert.rejects(vertexGenerate('system', 'user', deps), /rate_or_daily_limit/);
  assert.equal(state.requests.length, 1);
});

for (const status of [400, 401, 403, 404, 429]) test(`${status} is not retried`, async () => {
  const { state, deps } = harness([new Response('', { status }), ok()]);
  await assert.rejects(vertexGenerate('system', 'user', deps), new RegExp(`http_${status}`));
  assert.equal(state.requests.length, 1);
});

test('UTF-8 input bytes are bounded before any auth or paid request', async () => {
  const { state, deps } = harness();
  await assert.rejects(vertexGenerate('system', '語'.repeat(6000), deps), /input_limit/);
  assert.equal(state.reserved, 0);
  assert.equal(state.requests.length, 0);
});

test('missing credentials fail closed', async () => {
  const { state, deps } = harness();
  deps.token = async () => null;
  await assert.rejects(vertexGenerate('system', 'user', deps), /authentication/);
  assert.equal(state.requests.length, 0);
});

for (const finishReason of ['SAFETY', 'MAX_TOKENS']) test(`rejects ${finishReason} response`, async () => {
  const { deps } = harness([Response.json({ candidates: [{ finishReason, content: { parts: [{ text: '{}' }] } }] })]);
  await assert.rejects(vertexGenerate('system', 'user', deps), /blocked_or_incomplete/);
});

test('an outage does not latch subsequent calls offline', async () => {
  const { deps } = harness([new Response('', { status: 403 }), ok()]);
  await assert.rejects(vertexGenerate('system', 'user', deps));
  assert.equal(await vertexGenerate('system', 'user', deps), '{"ok":true}');
});

test('streaming body limit does not trust content-length', async () => {
  const req = new Request('https://example.test', { method: 'POST', body: JSON.stringify({ text: 'a'.repeat(32000) }), headers: { 'content-length': '1' } });
  assert.equal((await readBrainBody(req)).res.status, 413);
});

test('malformed JSON and non-object bodies rejected; valid request accepted', async () => {
  for (const body of ['{', 'null', '[]']) {
    assert.equal((await readBrainBody(new Request('https://example.test', { method: 'POST', body }))).res.status, 400);
  }
  assert.deepEqual((await readBrainBody(new Request('https://example.test', { method: 'POST', body: '{"text":"two ideas"}' }))).data, { text: 'two ideas' });
});

test('model outputs cannot create unlimited tasks or arbitrary card references', () => {
  assert.equal(CaptureResult.safeParse({ tasks: Array.from({ length: 21 }, () => ({ title: 'task' })) }).success, false);
  assert.equal(AssistantResult.safeParse({ answer: 'done', actions: [{ verb: 'done', cardRef: 'outside/board', confidence: 1 }] }).success, false);
});

test('fallback retains the original dump when the task limit is reached', async () => {
  const { fallbackCapture } = await import('../lib/types.ts');
  const text = Array.from({ length: 30 }, (_, i) => `Idea ${i}`).join('\n');
  const result = fallbackCapture(text);
  assert.equal(result.tasks.length, 20);
  assert.equal(result.tasks[0].description, text);
  assert.ok(result.tasks.every((task) => !task.dueAtConfident && !task.priorityConfident && !task.dueAt));
});

test('fallback preserves all 6000 characters across bounded descriptions', async () => {
  const { fallbackCapture } = await import('../lib/types.ts');
  const text = 'a'.repeat(6000);
  const result = fallbackCapture(text);
  assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks.map((task) => task.description).join(''), text);
});
