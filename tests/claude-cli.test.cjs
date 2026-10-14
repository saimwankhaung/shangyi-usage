const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readClaudeCLI, readClaudePlan, sanitizeUsage } = require('../app/providers/claude-cli.cjs');

test('Claude plan reader keeps only the subscription name and tolerates unavailable auth status', async () => {
  const account = { loggedIn: true, subscriptionType: 'pro', email: 'private-fixture-email', accessToken: 'private-fixture-secret' };
  const plan = await readClaudePlan('fixture.exe', { execFileProcess: (exe, args, options, callback) => {
    assert.deepEqual(args, ['auth', 'status']);
    assert.equal(options.windowsHide, true);
    callback(null, JSON.stringify(account));
  } });
  assert.equal(plan, 'Pro');
  assert.equal(await readClaudePlan('fixture.exe', { execFileProcess: (exe, args, options, callback) => callback(new Error('unsupported')) }), null);
  assert.equal(await readClaudePlan('fixture.exe', { execFileProcess: (exe, args, options, callback) => callback(null, '{"loggedIn":false,"subscriptionType":"pro"}') }), null);
  assert.equal(sanitizeUsage({ subscription_type: 'max' }).plan, 'Max');
  assert.equal(sanitizeUsage({ subscription_type: { token: 'private-fixture-secret' } }).plan, null);
});

test('Claude account reader initializes and asks only for quota, without an AI message', async () => {
  const requests = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.stdin.end = () => queueMicrotask(() => child.emit('close', 0));
  child.kill = () => child.emit('close', 1);
  child.stdin.write = text => {
    const request = JSON.parse(text); requests.push(request);
    const usage = { rate_limits: { five_hour: { utilization: 9, resets_at: '2033-05-18T03:33:20.000Z' }, seven_day: { utilization: 97, resets_at: null } }, credential: 'private-fixture-secret', session: { transcript: 'private-fixture-chat' } };
    queueMicrotask(() => child.stdout.emit('data', Buffer.from(JSON.stringify({ type: 'control_response', response: {
      subtype: 'success', request_id: request.request_id, response: request.request.subtype === 'get_usage' ? usage : { account: { private: 'private-fixture-secret' } }
    } }) + '\n')));
  };
  const snapshot = await readClaudeCLI('fixture.exe', { spawnProcess: () => child, timeoutMs: 1000 });
  assert.deepEqual(requests.map(row => row.request.subtype), ['initialize', 'get_usage']);
  assert.ok(requests.every(row => row.type === 'control_request'));
  assert.equal(snapshot.rateLimits.five_hour.used_percentage, 9);
  assert.equal(snapshot.rateLimits.five_hour.resets_at, 2000000000);
  assert.equal(snapshot.rateLimits.seven_day.used_percentage, 97);
  assert.ok(!JSON.stringify(snapshot).includes('private-fixture'));
});

test('quota sanitization keeps dynamic windows, ignores disabled credit limits and preserves unknown resets', () => {
  const snapshot = sanitizeUsage({ rate_limits: {
    five_hour: { utilization: null }, extra_usage: { utilization: 0, is_enabled: false }, iguana_necktie: { utilization: 0 },
    model_scoped: [{ utilization: 42, resets_at: null }], future_window: { utilization: 12, resets_at: 'invalid' }
  } }, 123);
  assert.equal(snapshot.observedAt, 123);
  assert.equal(snapshot.rateLimits.five_hour, undefined);
  assert.equal(snapshot.rateLimits.extra_usage, undefined);
  assert.equal(snapshot.rateLimits.iguana_necktie, undefined);
  assert.deepEqual(snapshot.rateLimits.model_scoped_0, { used_percentage: 42, resets_at: null });
  assert.deepEqual(snapshot.rateLimits.future_window, { used_percentage: 12, resets_at: null });
});

test('an unresponsive Claude account query times out and closes stdin', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  let ended = false;
  child.stdin.write = () => {};
  child.stdin.end = () => { ended = true; queueMicrotask(() => child.emit('close', 0)); };
  child.kill = () => child.emit('close', 1);
  await assert.rejects(readClaudeCLI('fixture.exe', { spawnProcess: () => child, timeoutMs: 10 }), /timed out/);
  assert.equal(ended, true);
});
