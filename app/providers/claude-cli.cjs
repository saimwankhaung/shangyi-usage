const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { findClaudeCLI, cliEnv } = require('../cli-discovery.cjs');

function planName(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9 _()+.-]{0,39}$/.test(value)) return null;
  return { pro: 'Pro', max: 'Max', team: 'Team', enterprise: 'Enterprise', free: 'Free' }[value.toLowerCase()] || value;
}

function readClaudePlan(executable, { execFileProcess = execFile } = {}) {
  return new Promise(resolve => {
    execFileProcess(executable, ['auth', 'status'], {
      windowsHide: true, cwd: path.dirname(executable), env: cliEnv(), timeout: 10000, maxBuffer: 128 * 1024
    }, (error, stdout) => {
      if (error) return resolve(null);
      try { const account = JSON.parse(stdout); resolve(account.loggedIn === true ? planName(account.subscriptionType) : null); }
      catch { resolve(null); }
    });
  });
}

async function readClaudeAccount(executable) {
  const [snapshot, plan] = await Promise.all([readClaudeCLI(executable), readClaudePlan(executable)]);
  return { ...snapshot, plan: snapshot.plan || plan };
}

function sanitizeUsage(usage, now = Date.now()) {
  const rateLimits = {};
  function add(key, row) {
    // Claude Code's account-usage UI does not present this provider field.
    if (key === 'iguana_necktie') return;
    if (!/^[a-zA-Z0-9_]{1,100}$/.test(key) || !row || row.is_enabled === false
      || typeof row.utilization !== 'number' || !Number.isFinite(row.utilization) || row.utilization < 0) return;
    const reset = typeof row.resets_at === 'number' ? row.resets_at : typeof row.resets_at === 'string' ? Date.parse(row.resets_at) / 1000 : null;
    rateLimits[key] = { used_percentage: row.utilization, resets_at: Number.isFinite(reset) ? reset : null };
  }
  for (const [key, row] of Object.entries(usage?.rate_limits || {})) {
    if (Array.isArray(row)) row.forEach((value, index) => add(`${key}_${index}`, value));
    else add(key, row);
  }
  return { schemaVersion: 1, source: 'claude-cli', observedAt: now, plan: planName(usage?.subscription_type), rateLimits };
}

// Reads the same account-usage control command used by the installed extension.
// There are no user messages, AI turns, auth-file reads, or permission changes.
function readClaudeCLI(executable, { spawnProcess = spawn, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(executable, ['--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'], {
      windowsHide: true, cwd: path.dirname(executable), env: { ...cliEnv(), CLAUDE_CODE_CONFIG_PROBE: '1' }
    });
    let done = false, closed = false, initialized = false, buffer = '', closeTimer;
    const timer = setTimeout(() => finish(new Error('Claude usage read timed out. Last known usage is kept.')), timeoutMs);
    function finish(error, value) {
      if (done) return;
      done = true; clearTimeout(timer);
      if (!closed) { closeTimer = setTimeout(() => child.kill(), 2000); closeTimer.unref(); }
      try { child.stdin.end(); } catch { }
      error ? reject(error) : resolve(value);
    }
    function send(id, request) { child.stdin.write(JSON.stringify({ type: 'control_request', request_id: id, request }) + '\n'); }
    child.on('error', () => finish(new Error('Claude Code could not start. Check that it is installed.')));
    child.stdin.on('error', () => finish(new Error('Claude Code closed the usage connection.')));
    child.stderr.on('data', () => { /* Never persist diagnostic text or credentials. */ });
    child.on('close', () => { closed = true; clearTimeout(closeTimer); if (!done) finish(new Error('Claude Code could not read account usage. Check your sign-in in Claude Code.')); });
    child.stdout.on('data', chunk => {
      if (done) return;
      buffer += chunk;
      if (buffer.length > 2 * 1024 * 1024) return finish(new Error('Claude usage response was too large.'));
      let at;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
        let message; try { message = JSON.parse(line); } catch { continue; }
        if (message.type !== 'control_response') continue;
        const response = message.response;
        if (!['shangyi-initialize', 'shangyi-quota'].includes(response?.request_id)) continue;
        if (response.subtype !== 'success') return finish(new Error('This Claude Code version or account did not return quota data.'));
        if (response.request_id === 'shangyi-initialize') { if (!initialized) { initialized = true; send('shangyi-quota', { subtype: 'get_usage', skip_behaviors: true }); } }
        else return finish(null, sanitizeUsage(response.response));
      }
    });
    send('shangyi-initialize', { subtype: 'initialize', hooks: {}, sdkMcpServers: [] });
  });
}
module.exports = { findClaudeCLI, readClaudeCLI, readClaudePlan, readClaudeAccount, sanitizeUsage };
