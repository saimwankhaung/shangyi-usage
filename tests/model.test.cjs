const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCodex, normalizeClaude, providerStatus, mascotReaction } = require('../app/model.cjs');
test('Codex reads multi-bucket data without doubling the legacy bucket', () => {
  const bucket = { primary: { usedPercent: 0, windowDurationMins: 15, resetsAt: 2000000000 }, secondary: null };
  const usage = normalizeCodex({ rateLimits: bucket, rateLimitsByLimitId: { codex: bucket,
    other: { limitName: 'Review', primary: { usedPercent: 108, windowDurationMins: 60, resetsAt: null } } } }, 'plus');
  assert.equal(usage.windows.length, 2);
  assert.equal(usage.windows[0].usedPercent, 0);
  assert.equal(usage.windows[0].label, '15-minute limit');
  assert.equal(usage.windows[1].usedPercent, 108);
  assert.equal(usage.windows[1].resetsAt, null);
  assert.equal(usage.plan, 'plus');
});
test('missing or invalid quotas stay unknown rather than becoming zero usage', () => {
  assert.equal(normalizeCodex({}).windows.length, 0);
  assert.equal(normalizeCodex({ rateLimits: { primary: { usedPercent: null } } }).status, 'unavailable');
  const usage = normalizeClaude({ rateLimits: { five_hour: { used_percentage: null }, seven_day: { used_percentage: '45' }, bad: { used_percentage: -1 } } });
  assert.equal(usage.windows.length, 0);
  assert.equal(usage.status, 'waiting');
});
test('Claude quota and future windows are read dynamically, independently of plan name', () => {
  const usage = normalizeClaude({ observedAt: 100, rateLimits: { five_hour: { used_percentage: 23.5, resets_at: '2030-01-01T00:00:00Z' },
    new_quota: { used_percentage: 14, resets_at: 2000000000 } } });
  assert.equal(usage.windows.length, 2);
  assert.equal(usage.windows[0].resetsAt, 1893456000);
  assert.equal(usage.plan, null);
  assert.equal(normalizeClaude({ plan: 'Pro' }).plan, 'Pro');
});
test('expired and idle snapshots stay stale; countdown expiry never implies new quota', () => {
  const now = 1900000000000;
  const p = normalizeClaude({ observedAt: now, rateLimits: { five_hour: { used_percentage: 99, resets_at: now / 1000 - 1 } } });
  assert.equal(providerStatus(p, now), 'stale');
  assert.equal(p.windows[0].usedPercent, 99);
  const idle = { ...p, observedAt: now - 300001, windows: [{ usedPercent: 20, resetsAt: null }] };
  assert.equal(providerStatus(idle, now), 'stale');
  assert.equal(mascotReaction([idle], now), 'Confused');
});
test('mascot uses the highest active limit from either provider', () => {
  const provider = pct => ({ status: 'live', observedAt: Date.now(), windows: [{ usedPercent: pct, resetsAt: null }] });
  assert.equal(mascotReaction([provider(15), provider(85)]), 'Thinking');
  assert.equal(mascotReaction([provider(100), provider(5)]), 'Sleep');
  assert.equal(mascotReaction([provider(0)]), 'Idle_Happy');
});
