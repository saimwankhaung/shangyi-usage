const { _electron } = require('playwright-core');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const output = path.join(root, 'test-results');
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'live-profile-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  let application;
  try {
    application = await _electron.launch({ executablePath: process.env.SHANGYI_TEST_EXECUTABLE || require('electron'),
      args: [root, '--test', `--profile=${profile}`], env });
    const page = await application.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#mascot-wrap');
    await page.waitForFunction(() => document.body.classList.contains('compact'));
    await page.locator('#mascot-wrap').click();
    await page.waitForSelector('.provider.codex');
    const result = await page.evaluate(() => window.shangyi.refresh());
    const codex = result.providers.find(p => p.id === 'codex');
    assert.equal(codex.status, 'live', codex.message);
    assert.ok(codex.windows.length > 0);
    assert.equal(result.demo, false);
    assert.equal(result.providers.find(p => p.id === 'claude').status, 'disconnected');
    await page.waitForFunction(() => document.querySelector('.provider.codex .usage-row'));
    const capture = await application.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
    await fs.writeFile(path.join(output, 'widget-live.png'), Buffer.from(capture, 'base64'));
    assert.deepEqual(errors, []);
    console.log('PASS: real Codex account data rendered in the desktop widget; Claude settings untouched.');
  } finally { await application?.close(); await fs.rm(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
