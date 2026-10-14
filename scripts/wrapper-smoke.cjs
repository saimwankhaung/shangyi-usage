const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const helper = path.join(root, 'dist', `ShanGyi-Usage-${version}-win-x64`, 'ShanGyiClaudeBridge.exe');
function run(args, dataDir, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(helper, args, { windowsHide: true, env: { ...process.env, SHANGYI_BRIDGE_DATA_DIR: dataDir } });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}
async function runLive(args, dataDir, input, expectedOutput) {
  const child = spawn(helper, args, { windowsHide: true, env: { ...process.env, SHANGYI_BRIDGE_DATA_DIR: dataDir } });
  let stdout = '', stderr = '';
  child.stderr.on('data', chunk => stderr += chunk);
  const closed = new Promise(resolve => child.on('close', code => resolve(code)));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('A small live request was buffered until stdin closed')), 5000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.stdout.on('data', chunk => {
        stdout += chunk;
        if (stdout === expectedOutput) { clearTimeout(timer); resolve(); }
      });
      // Keep stdin open, as VS Code does throughout an interactive session.
      child.stdin.write(input.slice(0, 7));
      child.stdin.write(input.slice(7));
    });
  } finally { child.stdin.end(); await closed; }
  return { stdout, stderr };
}
(async () => {
  const output = path.join(root, 'test-results'); await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'wrapper-test-'));
  try {
    const fixture = path.join(profile, 'fake-sdk.cjs');
    const event = { credential: 'private-fixture-secret', rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.26, resetsAt: 2000000000, auth: 'private-fixture-secret' }, seven_day: { utilization: 0.08, resetsAt: 2000500000 } } }, type: 'rate_limit_event' };
    const message = { type: 'assistant', message: 'private-fixture-chat'.repeat(5000) };
    const expected = JSON.stringify(message) + '\n' + JSON.stringify(event) + '\n';
    const args = ['--sdk-flag', 'value with spaces', 'quoted " value', 'C:\\folder\\'];
    await fs.writeFile(fixture, `let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{if(input!=='fixture-input 🦾'||JSON.stringify(process.argv.slice(2))!==${JSON.stringify(JSON.stringify(args))})process.exit(3);process.stdout.write(${JSON.stringify(expected.slice(0, 80000))});process.stdout.write(${JSON.stringify(expected.slice(80000))});process.stderr.write('fixture-stderr');process.exitCode=17;});`);
    const result = await run([process.execPath, fixture, ...args], profile, 'fixture-input 🦾');
    assert.equal(result.code, 17, result.stderr);
    assert.equal(result.stdout, expected);
    assert.equal(result.stderr, 'fixture-stderr');
    const snapshot = await fs.readFile(path.join(profile, 'claude-vscode-snapshot.json'), 'utf8');
    assert.equal(JSON.parse(snapshot).rateLimits.five_hour.used_percentage, 26);
    assert.ok(!snapshot.includes('private-fixture-chat'));
    assert.ok(!snapshot.includes('private-fixture-secret'));
    console.log('PASS: packaged VS Code helper preserves stdin/stdout/stderr/exit code and saves only quota fields.');
    const liveFixture = path.join(profile, 'live-sdk.cjs');
    const response = { response: { subtype: 'success', request_id: 'quota-fixture', response: {
      rate_limits: { five_hour: { utilization: 22, resets_at: '2033-05-18T03:33:20.000Z', private: 'private-fixture-secret' },
        seven_day: { utilization: 96, resets_at: null }, model_scoped: [{ utilization: 31, resets_at: '2033-05-23T03:33:20.000Z' }] },
      account_secret: 'private-fixture-secret', session: { transcript: 'private-fixture-chat' }
    } }, type: 'control_response' };
    const unrelated = { type: 'control_response', response: { subtype: 'success', request_id: 'not-a-usage-request', response: { rate_limits: { five_hour: { utilization: 99 } } } } };
    const liveExpected = JSON.stringify(response) + '\n' + JSON.stringify(unrelated) + '\n';
    await fs.writeFile(liveFixture, `require('node:readline').createInterface({input:process.stdin}).once('line',()=>process.stdout.write(${JSON.stringify(liveExpected)}));process.stdin.on('end',()=>process.exit(0));`);
    const request = JSON.stringify({ request_id: 'quota-fixture', request: { subtype: 'get_usage' }, type: 'control_request' }) + '\n';
    const live = await runLive([process.execPath, liveFixture], profile, request, liveExpected);
    assert.equal(live.stdout, liveExpected);
    assert.equal(live.stderr, '');
    const liveSnapshot = await fs.readFile(path.join(profile, 'claude-vscode-snapshot.json'), 'utf8');
    const rates = JSON.parse(liveSnapshot).rateLimits;
    assert.equal(rates.five_hour.used_percentage, 22, 'Only the matching usage response can update quotas');
    assert.equal(rates.five_hour.resets_at, 2000000000);
    assert.equal(rates.seven_day.used_percentage, 96);
    assert.equal(rates.seven_day.resets_at, null);
    assert.equal(rates.model_scoped_0.used_percentage, 31);
    assert.ok(!liveSnapshot.includes('private-fixture-secret') && !liveSnapshot.includes('private-fixture-chat'));
    console.log('PASS: small requests reach a live child before EOF; correlated account-usage responses are sanitized, and unrelated responses are ignored.');
    const executable = process.argv[2];
    if (executable) {
      const actual = await run([executable, '--version'], profile);
      assert.equal(actual.code, 0, actual.stderr);
      assert.match(actual.stdout, /Claude Code/);
      console.log('PASS: helper launches the actual VS Code bundled Claude executable with no AI request.');
    }
  } finally { await fs.rm(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
