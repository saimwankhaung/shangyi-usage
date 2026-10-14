// Renders the README images. The usage panel is captured from the running app
// (demo profile, example numbers); the three illustrations are HTML pages in
// docs/source/ that place that capture next to the ShanGyi mascot.
// Run on Windows with `npm run docs:images`; fonts come from the system.
const { _electron } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const images = path.join(root, 'docs', 'images');
(async () => {
  const work = path.join(root, 'test-results');
  await fs.mkdir(work, { recursive: true });
  const profile = await fs.mkdtemp(path.join(work, 'docs-profile-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let application;
  try {
    application = await _electron.launch({ executablePath: require('electron'), args: [root, '--demo', '--test', `--profile=${profile}`], env, timeout: 30000 });
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.classList.contains('compact'));
    // The default spot near the bottom of the screen, so the panel opens above the mascot.
    await application.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows()[0], area = screen.getPrimaryDisplay().workArea;
      window.setPosition(area.x + area.width - 330, area.y + area.height - 256);
    });
    await page.locator('#mascot-wrap').click();
    await page.waitForFunction(() => !document.body.classList.contains('compact') && current.layout.placement === 'above'
      && window.innerWidth === current.layout.bounds.width && !document.getAnimations().length);
    // Example numbers, shown without the demo banner. They are not account data.
    await page.evaluate(() => {
      const now = Date.now(), seconds = now / 1000;
      const example = { claude: { plan: 'Pro', rows: [[0, null], [97, seconds + 44 * 60 - 30]] },
        codex: { plan: 'plus', rows: [[51, seconds + 2 * 3600 + 48 * 60 - 30], [27, seconds + 5 * 86400 + 14 * 3600 + 30 * 60]] } };
      render({ ...current, demo: false, providers: current.providers.map(provider => ({ ...provider, status: 'live', displayStatus: 'live',
        plan: example[provider.id].plan, observedAt: now - 51000,
        windows: provider.windows.map((row, index) => ({ ...row, usedPercent: example[provider.id].rows[index][0], resetsAt: example[provider.id].rows[index][1] })) })) });
    });
    // The panel alone: hide the mascot under it while capturing.
    await page.evaluate(() => { document.getElementById('hero').style.visibility = 'hidden'; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const panel = await page.evaluate(() => current.layout.panel);
    const base64 = await application.evaluate(async ({ BrowserWindow }, rect) => {
      const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(rect, { stayHidden: true, stayAwake: true });
      return image.toPNG().toString('base64');
    }, { x: panel.x - 12, y: panel.y - 12, width: panel.width + 24, height: panel.height + 34 });
    await fs.writeFile(path.join(images, 'usage-panel.png'), Buffer.from(base64, 'base64'));
    for (const name of ['overview', 'mascot-controls', 'windows-quickstart']) {
      const picture = await application.evaluate(async ({ BrowserWindow }, file) => {
        const window = new BrowserWindow({ show: false, width: 1600, height: 900, useContentSize: true, webPreferences: { offscreen: true } });
        try {
          await window.loadFile(file);
          await window.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map(img => img.decode())))');
          await new Promise(resolve => setTimeout(resolve, 300));
          return (await window.webContents.capturePage({ x: 0, y: 0, width: 1600, height: 900 })).toPNG().toString('base64');
        } finally { window.destroy(); }
      }, path.join(root, 'docs', 'source', `${name}.html`));
      await fs.writeFile(path.join(images, `${name}.png`), Buffer.from(picture, 'base64'));
    }
    console.log('Wrote docs/images: usage-panel.png, overview.png, mascot-controls.png, windows-quickstart.png');
  } finally {
    await application?.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
