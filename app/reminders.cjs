const COOLDOWN_MS = 30 * 60 * 1000;
const levelFor = percent => percent >= 100 ? 100 : percent >= 95 ? 95 : percent >= 80 ? 80 : 0;

class LimitReminders {
  constructor(saved = {}) {
    this.rows = new Map();
    this.seen = new Set();
    this.lastAlert = new Map();
    for (const [key, row] of Object.entries(saved.rows || {}).slice(-100)) {
      if (row && Number.isFinite(row.highUsed) && [0, 80, 95, 100].includes(row.level)
        && Number.isFinite(row.seenAt)) this.rows.set(key, { ...row });
    }
    for (const [key, time] of Object.entries(saved.lastAlert || {})) {
      if (Number.isFinite(time)) this.lastAlert.set(key, time);
    }
  }

  consume(provider, { now = Date.now(), enabled = true } = {}) {
    const candidates = [];
    for (const row of provider.windows) {
      if (!Number.isFinite(row.usedPercent) || row.usedPercent < 0 || (row.resetsAt && row.resetsAt * 1000 <= now)) continue;
      const key = `${provider.id}:${row.id}`;
      const old = this.rows.get(key);
      const level = levelFor(row.usedPercent);
      // A reset timestamp can drift or differ between bridges. It is not a new cycle until the old reset has passed.
      const reset = Boolean(old && ((old.resetsAt && old.resetsAt * 1000 <= now && row.resetsAt > old.resetsAt + 60)
        || (!old.resetsAt && old.highUsed - row.usedPercent >= 30 && level < old.level)));
      const initial = !this.seen.has(key) || !old || reset;
      const freshCycle = !old || reset;
      if (!initial && level > old.level) candidates.push({ ...row, level });
      this.rows.set(key, { level: freshCycle ? level : Math.max(old.level, level),
        highUsed: freshCycle ? row.usedPercent : Math.max(old.highUsed, row.usedPercent),
        resetsAt: freshCycle ? row.resetsAt || null : old.resetsAt || row.resetsAt || null, seenAt: now });
      this.seen.add(key);
    }
    for (const [key, row] of this.rows) if (now - row.seenAt > 31 * 86400000) this.rows.delete(key);
    // Consume crossings while muted too: enabling reminders must not replay old warnings.
    if (!enabled || !candidates.length) return [];
    const last = this.lastAlert.get(provider.id);
    if (Number.isFinite(last) && now - last < COOLDOWN_MS && !candidates.some(row => row.level === 100)) return [];
    this.lastAlert.set(provider.id, now);
    return candidates;
  }

  snapshot() { return { rows: Object.fromEntries(this.rows), lastAlert: Object.fromEntries(this.lastAlert) }; }
}
module.exports = { LimitReminders, COOLDOWN_MS };
