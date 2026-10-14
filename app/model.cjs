const STALE_MS = 5 * 60 * 1000;

function percent(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function epoch(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp / 1000;
  }
  return null;
}
function text(value, fallback = '') {
  return typeof value === 'string' ? value.slice(0, 120) : fallback;
}
function durationLabel(minutes, fallback) {
  if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
  if (minutes % 1440 === 0) return `${minutes / 1440}-day limit`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour limit`;
  return `${minutes}-minute limit`;
}
function normalizeCodex(payload, plan = null, observedAt = Date.now()) {
  const buckets = payload?.rateLimitsByLimitId;
  const limits = buckets && typeof buckets === 'object' && Object.keys(buckets).length
    ? Object.entries(buckets)
    : payload?.rateLimits ? [[payload.rateLimits.limitId || 'codex', payload.rateLimits]] : [];
  const windows = [];
  for (const [bucketId, bucket] of limits) {
    if (!bucket || typeof bucket !== 'object') continue;
    for (const [position, fallback] of [['primary', 'Session limit'], ['secondary', 'Weekly limit']]) {
      const row = bucket[position];
      if (!row || percent(row.usedPercent) === null) continue;
      windows.push({ id: `${bucketId}:${position}`, label: durationLabel(row.windowDurationMins, fallback),
        bucket: text(bucket.limitName, text(bucketId)), usedPercent: percent(row.usedPercent),
        resetsAt: epoch(row.resetsAt), windowMinutes: row.windowDurationMins ?? null });
    }
    if (!plan && bucket.planType) plan = text(bucket.planType);
  }
  return { id: 'codex', name: 'Codex', plan: text(plan) || null, windows, observedAt,
    status: windows.length ? 'live' : 'unavailable', source: 'Codex App Server',
    message: windows.length ? '' : 'Your account has not returned quota data. API-key accounts do not expose subscription limits.' };
}
function normalizeClaude(snapshot) {
  const labels = { five_hour: '5-hour limit', seven_day: '7-day limit', spend_limit: 'Spend limit' };
  const windows = [];
  for (const [id, row] of Object.entries(snapshot?.rateLimits || {})) {
    if (!row || percent(row.used_percentage) === null) continue;
    windows.push({ id, label: labels[id] || id.replaceAll('_', ' '), bucket: '',
      usedPercent: percent(row.used_percentage), resetsAt: epoch(row.resets_at),
      windowMinutes: id === 'five_hour' ? 300 : id === 'seven_day' ? 10080 : null });
  }
  const observedAt = typeof snapshot?.observedAt === 'number' ? snapshot.observedAt : null;
  return { id: 'claude', name: 'Claude', plan: text(snapshot?.plan) || null, model: text(snapshot?.model), windows, observedAt,
    status: windows.length ? 'live' : 'waiting', source: snapshot?.source === 'claude-cli' ? 'Claude Code account usage' : snapshot?.source === 'vscode' ? 'Claude Code VS Code extension' : 'Claude Code status line',
    message: windows.length ? '' : 'Waiting for Claude Code to share rate limits. Run a normal Claude Code turn after enabling the bridge. Some plans and versions do not supply these fields.' };
}
function providerStatus(provider, now = Date.now()) {
  if (provider.status !== 'live') return provider.status;
  if (!provider.observedAt || now - provider.observedAt > STALE_MS) return 'stale';
  if (provider.windows.some(row => row.resetsAt && row.resetsAt * 1000 <= now)) return 'stale';
  return 'live';
}
function mascotReaction(providers, now = Date.now()) {
  const windows = providers.flatMap(p => providerStatus(p, now) === 'live' ? p.windows : []);
  if (!windows.length) return 'Confused';
  const highest = Math.max(...windows.map(row => row.usedPercent));
  return highest >= 100 ? 'Sleep' : highest >= 80 ? 'Thinking' : 'Idle_Happy';
}
function demoProviders(now = Date.now()) {
  return [normalizeClaude({ observedAt: now, model: 'Demo account', rateLimits: {
    five_hour: { used_percentage: 28, resets_at: now / 1000 + 10080 },
    seven_day: { used_percentage: 46, resets_at: now / 1000 + 216000 }
  } }), normalizeCodex({ rateLimits: { limitId: 'codex', primary: { usedPercent: 17, windowDurationMins: 300, resetsAt: now / 1000 + 7920 }, secondary: { usedPercent: 33, windowDurationMins: 10080, resetsAt: now / 1000 + 345600 } } }, 'Demo', now)];
}
module.exports = { normalizeCodex, normalizeClaude, providerStatus, mascotReaction, demoProviders, STALE_MS };
