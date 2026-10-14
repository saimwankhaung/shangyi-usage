const { _electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
(async () => {
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'ui-profile-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let application;
  async function capture(name) {
    const page = await application.firstWindow();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(200);
    const base64 = await application.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const image = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
      return image.toPNG().toString('base64');
    });
    await fs.writeFile(path.join(output, name), Buffer.from(base64, 'base64'));
  }
  // Screen position of the mascot box: window position plus its place in the page.
  async function mascotOnScreen(page) {
    const box = await page.locator('#mascot-wrap').boundingBox();
    const [x, y] = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getPosition());
    return { x: Math.round(x + box.x), y: Math.round(y + box.y) };
  }
  const panelAnimating = () => document.getAnimations().some(animation => animation.effect?.target?.id === 'panel');
  try {
    application = await _electron.launch({ executablePath: process.env.SHANGYI_TEST_EXECUTABLE || require('electron'), args: [root, '--demo', '--test', `--profile=${profile}`], env, timeout: 30000 });
    const page = await application.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#mascot-wrap');
    await page.waitForFunction(() => document.body.classList.contains('compact'));
    assert.equal(await page.locator('#panel').isVisible(), false);
    assert.equal(await page.locator('#compact-panel').isVisible(), false);
    const mascotBounds = await page.locator('#mascot-wrap').boundingBox();
    const start = { x: mascotBounds.x + mascotBounds.width / 2, y: mascotBounds.y + mascotBounds.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 22, start.y + 16, { steps: 3 });
    await page.mouse.up();
    assert.equal(await page.locator('body.compact').count(), 1, 'Dragging the mascot must not open details');
    const restingMascot = await mascotOnScreen(page);
    // Small hand movement is still a click, rather than an unintended drag.
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 3, start.y + 2);
    await page.mouse.up();
    await page.waitForFunction(panelAnimating);
    await page.waitForFunction(() => !document.body.classList.contains('compact') && window.innerWidth === current.layout.bounds.width);
    assert.deepEqual(await mascotOnScreen(page), restingMascot, 'Opening the panel must not move the mascot');
    await page.waitForSelector('.provider.codex .usage-row');
    assert.equal(await page.locator('.usage-row').count(), 4);
    assert.equal(await page.locator('#demo-banner').isVisible(), true);
    const logo = await page.locator('.brand-mark img').evaluate(img => img.complete && img.naturalWidth > 0);
    assert.ok(logo, 'The ShanGyi logo must load');
    // Provider marks are not bundled: each provider gets a neutral glyph and its name as text.
    assert.equal(await page.locator('.provider-symbol svg').count(), 2);
    assert.equal(await page.locator('.provider-symbol img').count(), 0);
    const video = await page.locator('#mascot').evaluate(async video => {
      await new Promise((resolve, reject) => {
        if (video.readyState >= 2) return resolve();
        video.addEventListener('loadeddata', resolve, { once: true });
        video.addEventListener('error', () => reject(new Error('Mascot video could not decode')), { once: true });
      });
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
      const context = canvas.getContext('2d'); context.drawImage(video, 0, 0);
      const alpha = context.getImageData(0, 0, 1, 1).data[3];
      return { width: video.videoWidth, height: video.videoHeight, alpha, paused: video.paused };
    });
    assert.equal(video.width, 512);
    assert.equal(video.alpha, 0, 'Mascot video must be transparent');
    assert.equal(video.paused, false);
    // A configured bridge with no measurement must not ask to connect again.
    await page.evaluate(() => {
      window.__smokeSavedState = current;
      render({ ...current, claudeConfigured: true, providers: current.providers.map(provider => provider.id === 'claude'
        ? { ...provider, windows: [], status: 'waiting', observedAt: null } : provider) });
    });
    assert.match(await page.locator('.provider.claude .provider-badge').textContent(), /Connected/);
    assert.equal(await page.locator('.provider.claude .connect-action').textContent(), 'Connection settings');
    assert.equal(await page.locator('.provider.claude').getByRole('button', { name: 'Connect', exact: true }).count(), 0);
    await page.evaluate(() => { render(window.__smokeSavedState); delete window.__smokeSavedState; });
    await capture('widget-demo.png');
    await page.locator('#settings-button').click();
    assert.equal(await page.locator('#settings-view').isVisible(), true);
    await page.locator('#claude-source').selectOption('vscode');
    await page.waitForFunction(() => document.querySelector('#claude-source').value === 'vscode');
    // --test routes VS Code settings to this temporary profile, never the user's settings.
    if (process.env.SHANGYI_TEST_EXECUTABLE && process.platform === 'win32') {
      await page.locator('#connect-claude').click();
      await page.waitForFunction(() => !document.querySelector('#connect-claude').disabled);
      assert.equal(await page.locator('#connect-claude').textContent(), 'Reconnect', await page.locator('#toast').textContent());
      assert.ok(JSON.parse(await fs.readFile(path.join(profile, 'test-vscode-settings.json'), 'utf8'))['claudeCode.claudeProcessWrapper']);
      await page.locator('#disconnect-claude').click();
      await page.waitForFunction(() => document.querySelector('#connect-claude').textContent === 'Connect');
    }
    await page.locator('#locale').selectOption('my');
    await page.waitForFunction(() => document.documentElement.lang === 'my');
    assert.match(await page.locator('#settings-title').textContent(), /ပြင်ဆင်/);
    await page.locator('#locale').selectOption('th');
    await page.waitForFunction(() => document.documentElement.lang === 'th');
    assert.equal(await page.locator('#language-label').textContent(), 'ภาษา');
    assert.equal(await page.locator('#settings-back').textContent(), 'เสร็จสิ้น');
    assert.equal(await page.locator('#refresh-seconds option[value="60"]').textContent(), '1 นาที');
    assert.equal(JSON.parse(await fs.readFile(path.join(profile, 'settings.json'), 'utf8')).locale, 'th');
    await capture('settings-thai.png');
    await page.locator('#settings-back').click();
    assert.match(await page.locator('.provider.claude .row-label').first().textContent(), /ขีดจำกัด/);
    await capture('widget-thai.png');
    await page.locator('#settings-button').click();
    await page.locator('#locale').selectOption('en');
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    await page.locator('label:has(#animations)').click();
    await page.waitForFunction(() => document.querySelector('#mascot').paused);
    await page.locator('label:has(#animations)').click();
    await page.waitForFunction(() => !document.querySelector('#mascot').paused);
    await capture('settings.png');
    await page.locator('#settings-back').click();
    await page.locator('#compact-button').click();
    await page.waitForFunction(panelAnimating);
    await page.waitForSelector('body.compact');
    await page.waitForFunction(() => window.innerWidth === 210 && window.innerHeight === 216);
    assert.deepEqual(await mascotOnScreen(page), restingMascot, 'Closing the panel must not move the mascot');
    assert.equal(await page.locator('#compact-demo').isVisible(), true);
    await capture('widget-compact.png');
    // At the top of the screen the panel opens below the mascot, which stays where it was put.
    await application.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows()[0], area = screen.getDisplayMatching(window.getBounds()).workArea;
      window.setPosition(area.x + 200, area.y);
    });
    const topMascot = await mascotOnScreen(page);
    await page.locator('#mascot-wrap').click();
    await page.waitForFunction(() => !document.body.classList.contains('compact') && window.innerWidth === current.layout.bounds.width && window.innerHeight === current.layout.bounds.height);
    // Below on a tall display, beside it on a short one (CI runners); never above, where there is no room.
    assert.notEqual(await page.evaluate(() => current.layout.placement), 'above');
    assert.deepEqual(await mascotOnScreen(page), topMascot, 'The mascot must not drop when the panel opens');
    await page.waitForFunction(() => !document.getAnimations().length);
    const [mascotBox, panelBox] = [await page.locator('#mascot-wrap').boundingBox(), await page.locator('#panel').boundingBox()];
    const apart = panelBox.y >= mascotBox.y + mascotBox.height || panelBox.x >= mascotBox.x + mascotBox.width || panelBox.x + panelBox.width <= mascotBox.x;
    assert.ok(apart, 'The panel opens below or beside the mascot without covering it');
    const preferences = await application.evaluate(({ BrowserWindow }) => {
      const web = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return { sandbox: web.sandbox, contextIsolation: web.contextIsolation, nodeIntegration: web.nodeIntegration };
    });
    assert.deepEqual(preferences, { sandbox: true, contextIsolation: true, nodeIntegration: false });
    assert.deepEqual(errors, []);
    await page.locator('#mascot-wrap').click();
    await page.waitForFunction(() => document.body.classList.contains('compact'));
    assert.deepEqual(await mascotOnScreen(page), topMascot);
    console.log('PASS: mascot-only launch, drag without toggling, click-to-toggle details with open/close animation, mascot stays put while the panel finds room, four quota rows, transparent 3D WebM, native window resize, Burmese language, animation toggle, renderer isolation.');
  } finally {
    await application?.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
