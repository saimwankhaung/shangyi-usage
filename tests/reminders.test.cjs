const test = require('node:test');
const assert = require('node:assert/strict');
const { LimitReminders, COOLDOWN_MS } = require('../app/reminders.cjs');
const start = 1900000000000;
const reset = start / 1000 + 3600;
const provider = (used, resetsAt = reset) => ({ id: 'claude', windows: [{ id: 'seven_day', label: '7-day limit', usedPercent: used, resetsAt }] });
const consume = (reminders, used, now = start, resetsAt = reset, enabled = true) => reminders.consume(provider(used, resetsAt), { now, enabled });

test('startup is quiet and refreshes, percentage oscillations and reset jitter do not repeat warnings', () => {
  const reminders = new LimitReminders();
  assert.equal(consume(reminders, 70).length, 0);
  assert.equal(consume(reminders, 96).length, 1);
  for (const used of [96, 94, 96, 79, 96]) assert.equal(consume(reminders, used, start + COOLDOWN_MS, reset + 120).length, 0);
  assert.equal(consume(reminders, 100, start + 1000).length, 1);
  assert.equal(consume(reminders, 99, start + 2000).length, 0);
  assert.equal(consume(reminders, 100, start + 3000).length, 0);
});

test('history survives reopening and an actual elapsed reset starts a new cycle', () => {
  let reminders = new LimitReminders();
  consume(reminders, 70); consume(reminders, 97);
  reminders = new LimitReminders(reminders.snapshot());
  assert.equal(consume(reminders, 90).length, 0);
  assert.equal(consume(reminders, 97, start + COOLDOWN_MS).length, 0);
  const now = (reset + 1) * 1000;
  assert.equal(consume(reminders, 0, now, reset + 3600).length, 0);
  assert.equal(consume(reminders, 96, now + 1000, reset + 3600).length, 1);
});

test('cooldown consumes intermediate thresholds and reaching 100 percent can still alert once', () => {
  const reminders = new LimitReminders();
  consume(reminders, 70);
  assert.equal(consume(reminders, 80).length, 1);
  assert.equal(consume(reminders, 95, start + 60000).length, 0);
  assert.equal(consume(reminders, 95, start + COOLDOWN_MS).length, 0);
  assert.equal(consume(reminders, 100, start + 120000).length, 1);
});

test('muted crossings are not replayed, expired samples are ignored, and unknown resets rearm only after a substantial drop', () => {
  const reminders = new LimitReminders();
  consume(reminders, 70, start, null);
  assert.equal(consume(reminders, 97, start, null, false).length, 0);
  assert.equal(consume(reminders, 97, start + COOLDOWN_MS, null).length, 0);
  assert.equal(consume(reminders, 96, start + COOLDOWN_MS, start / 1000 - 1).length, 0);
  consume(reminders, 20, start + COOLDOWN_MS, null);
  assert.equal(consume(reminders, 96, start + COOLDOWN_MS + 1000, null).length, 1);
});

test('simultaneous windows use one grouped notification', () => {
  const reminders = new LimitReminders();
  const value = { id: 'codex', windows: [{ id: 'primary', usedPercent: 70 }, { id: 'secondary', usedPercent: 70 }] };
  reminders.consume(value, { now: start });
  value.windows.forEach(row => row.usedPercent = 96);
  assert.equal(reminders.consume(value, { now: start + 1000 }).length, 2);
  assert.equal(reminders.consume(value, { now: start + 2000 }).length, 0);
});
