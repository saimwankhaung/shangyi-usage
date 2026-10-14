const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { installBridge, removeBridge } = require('../app/bridge-setup.cjs');
const sourceScript = path.resolve(__dirname, '../app/bridge/claude-statusline.ps1');
async function fixture(t) {
  const parent = path.resolve(__dirname, '../test-results');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'bridge-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { settingsFile: path.join(root, 'claude', 'settings.json'), dataDir: path.join(root, 'profile'), sourceScript };
}
test('setup preserves unrelated settings and restores the original status line', async t => {
  const options = await fixture(t);
  await fs.mkdir(path.dirname(options.settingsFile), { recursive: true });
  const initial = { permissions: { allow: ['Read'] }, env: { custom: 'kept' }, statusLine: { type: 'command', command: 'old-command', padding: 4 } };
  await fs.writeFile(options.settingsFile, JSON.stringify(initial));
  assert.equal((await installBridge(options)).needsConfirmation, true);
  assert.deepEqual(JSON.parse(await fs.readFile(options.settingsFile, 'utf8')), initial);
  await installBridge({ ...options, replaceExisting: true });
  await installBridge(options);
  const installed = JSON.parse(await fs.readFile(options.settingsFile, 'utf8'));
  assert.deepEqual(installed.permissions, initial.permissions);
  assert.equal(installed.statusLine.padding, 4);
  assert.equal((await removeBridge(options)).restored, true);
  assert.deepEqual(JSON.parse(await fs.readFile(options.settingsFile, 'utf8')), initial);
});
test('disconnect leaves a later user edit intact', async t => {
  const options = await fixture(t);
  await installBridge(options);
  await fs.writeFile(options.settingsFile, JSON.stringify({ statusLine: { command: 'new-user-command' }, theme: 'dark' }));
  assert.equal((await removeBridge(options)).restored, false);
  assert.equal(JSON.parse(await fs.readFile(options.settingsFile, 'utf8')).statusLine.command, 'new-user-command');
});
test('Windows bridge strips credentials, prompts and session paths from its snapshot', { skip: process.platform !== 'win32' }, async t => {
  const options = await fixture(t);
  const target = path.join(options.dataDir, 'claude-snapshot.json');
  const result = await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', sourceScript, '-SnapshotPath', target], { windowsHide: true });
    let output = ''; child.stdout.on('data', part => output += part);
    child.stderr.on('data', part => output += part);
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(output) : reject(new Error('Bridge failed')));
    child.stdin.end(JSON.stringify({ accessToken: 'must-not-be-exported', transcript_path: 'private-path', prompt: 'private prompt', model: { display_name: 'Claude' },
      rate_limits: { five_hour: { used_percentage: 0, resets_at: 2000000000, private_field: 'private' } } }));
  });
  const body = await fs.readFile(target, 'utf8').catch(() => { throw new Error(result); });
  assert.ok(!body.includes('private'));
  assert.ok(!body.includes('must-not-be-exported'));
  assert.equal(JSON.parse(body).rateLimits.five_hour.used_percentage, 0);
  assert.match(result, /5h: 0%/);
});
