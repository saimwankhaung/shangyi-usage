const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { CodexClient } = require('../app/providers/codex.cjs');
function fakeServer(handle) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.killed = false;
  child.stdin = new Writable({ write(chunk, _, done) { handle(JSON.parse(chunk.toString()), child); done(); } });
  child.kill = () => { child.killed = true; child.emit('exit', 0); };
  return child;
}
function reply(child, request, result) { setImmediate(() => child.stdout.write(JSON.stringify({ id: request.id, result }) + '\n')); }
test('Codex protocol initializes before account reads and streams limit changes', async () => {
  const calls = [];
  const child = fakeServer((request, c) => {
    calls.push(request.method);
    if (request.method === 'initialize') reply(c, request, {});
    if (request.method === 'account/read') reply(c, request, { account: { type: 'chatgpt', planType: 'plus', email: 'private' } });
    if (request.method === 'account/rateLimits/read') reply(c, request, { rateLimits: { primary: { usedPercent: 15, windowDurationMins: 300 } } });
  });
  const client = new CodexClient('fake', { spawnProcess: () => child });
  const result = await client.readUsage();
  assert.deepEqual(calls, ['initialize', 'initialized', 'account/read', 'account/rateLimits/read']);
  assert.equal(result.plan, 'plus');
  assert.ok(!JSON.stringify(result).includes('private'));
  const update = new Promise(resolve => client.once('update', resolve));
  child.stdout.write('{"method":"account/rateLimits/updated","params":{"rateLimits":{"primary":{"usedPercent":45}}}}\n');
  assert.equal((await update).windows[0].usedPercent, 45);
  client.stop();
});
test('timed-out RPCs reject and can be shut down without unresolved pending requests', async () => {
  const child = fakeServer(() => {});
  const client = new CodexClient('fake', { spawnProcess: () => child, timeoutMs: 20 });
  await assert.rejects(client.connect(), /did not respond/);
  assert.equal(client.pending.size, 0);
  assert.equal(child.killed, true);
});
test('signed-out accounts produce a connection instruction rather than fabricated usage', async () => {
  const child = fakeServer((request, c) => {
    if (request.method === 'initialize') reply(c, request, {});
    if (request.method === 'account/read') reply(c, request, { account: null });
  });
  const client = new CodexClient('fake', { spawnProcess: () => child });
  await assert.rejects(client.readUsage(), /codex login/);
  client.stop();
});
