const { _electron } = require('playwright-core');
const path = require('node:path');
const fs = require('node:fs/promises');
const root = path.resolve(__dirname, '..');
(async () => {
  const profile = path.join(root, 'test-results', 'icon-profile');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const application = await _electron.launch({ executablePath: require('electron'), args: [root, '--demo', '--test', `--profile=${profile}`], env });
  try {
    const page = await application.firstWindow();
    const data = await page.evaluate(async () => {
      const image = new Image(); image.src = '../assets/logos/shangyi.svg'; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const scale = Math.min(220 / image.naturalWidth, 220 / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      ctx.drawImage(image, (256 - width) / 2, (256 - height) / 2, width, height);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const png = Buffer.from(data, 'base64');
    await fs.writeFile(path.join(root, 'app/assets/icon.png'), png);
    const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
    ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
    await fs.writeFile(path.join(root, 'app/assets/icon.ico'), Buffer.concat([ico, png]));
    console.log('Rendered supplied ShanGyi vector logo as the app/tray icon.');
  } finally { await application.close(); await fs.rm(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
