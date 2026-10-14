const path = require('node:path');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
module.exports = (async () => {
  const root = path.resolve(__dirname, '..');
  const arch = process.argv.find(arg => arg.startsWith('--arch='))?.split('=')[1] || (process.platform === 'darwin' ? process.arch : 'arm64');
  if (!['arm64', 'x64'].includes(arch)) throw new Error('Choose --arch=arm64 or --arch=x64.');
  const { downloadArtifact } = await import('@electron/get');
  const cacheRoot = path.join(root, 'test-results/electron-cache');
  await fs.mkdir(cacheRoot, { recursive: true });
  const version = require('electron/package.json').version;
  console.log(`Downloading verified Electron ${version} for macOS ${arch}…`);
  const archive = await downloadArtifact({ version, artifactName: 'electron', platform: 'darwin', arch, cacheRoot, tempDirectory: cacheRoot });
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python.exe' : 'python3');
  execFileSync(python, [path.join(__dirname, 'package-macos.py'), '--runtime', archive, '--arch', arch], { stdio: 'inherit', windowsHide: true });
})().catch(error => { console.error(error.message); process.exitCode = 1; });
