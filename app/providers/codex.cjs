const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { normalizeCodex } = require('../model.cjs');
const { cliEnv } = require('../cli-discovery.cjs');

class CodexClient extends EventEmitter {
  constructor(executable = 'codex', options = {}) {
    super();
    this.executable = executable;
    this.spawnProcess = options.spawnProcess || spawn;
    this.timeoutMs = options.timeoutMs || 18000;
    this.pending = new Map();
    this.nextId = 1;
    this.plan = null;
  }
  async connect() {
    if (this.ready) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.initialize().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async initialize() {
    const child = this.spawnProcess(this.executable, ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false, env: cliEnv()
    });
    this.child = child;
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 2 * 1024 * 1024) {
        this.fail(new Error('Codex returned an oversized response.'));
        child.kill();
        return;
      }
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try { this.receive(JSON.parse(line)); } catch { /* Non-protocol output is ignored. */ }
      }
    });
    // Never forward stderr: a CLI may put private account details in diagnostics.
    child.stderr.resume();
    child.stdin.on('error', () => this.fail(new Error('Codex connection closed.')));
    child.on('error', error => this.fail(new Error(error.code === 'ENOENT'
      ? 'Codex CLI was not found. Install it or choose codex.exe in Settings.'
      : 'Codex could not start. Check the CLI path in Settings.')));
    child.on('exit', () => {
      if (this.child !== child) return;
      this.child = null;
      this.fail(new Error('Codex connection closed. Refresh to reconnect.'));
    });
    try {
      await this.request('initialize', { clientInfo: { name: 'shangyi_usage', title: 'ShanGyi Usage', version: '0.1.0' }, capabilities: { experimentalApi: true } });
      this.notify('initialized');
      this.ready = true;
    } catch (error) { this.stop(); throw error; }
  }
  receive(message) {
    if (message.id !== undefined && this.pending.has(message.id)) {
      const request = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error('Codex could not read account usage. Sign in with codex login and refresh.'));
      else request.resolve(message.result);
    } else if (message.method === 'account/rateLimits/updated') {
      this.emit('update', normalizeCodex(message.params, this.plan));
    }
  }
  request(method, params) {
    if (!this.child || this.child.killed) return Promise.reject(new Error('Codex is not connected.'));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Codex did not respond in time. Refresh to retry.'));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, ...(params !== undefined ? { params } : {}) }) + '\n');
    });
  }
  notify(method) { this.child?.stdin.write(JSON.stringify({ method }) + '\n'); }
  async readUsage() {
    await this.connect();
    const result = await this.request('account/read', { refreshToken: false });
    const account = result?.account;
    if (!account) throw new Error('Sign in with codex login, then refresh this widget.');
    if (account.type === 'apiKey') throw new Error('This Codex account uses an API key. Sign in with ChatGPT to view subscription limits.');
    this.plan = account.planType || null;
    return normalizeCodex(await this.request('account/rateLimits/read'), this.plan);
  }
  fail(error) {
    this.ready = false;
    for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(error); }
    this.pending.clear();
    this.emit('connection-error', error);
  }
  stop() {
    const child = this.child;
    this.child = null;
    this.ready = false;
    this.fail(new Error('Codex connection stopped.'));
    child?.kill();
  }
}
module.exports = { CodexClient };
