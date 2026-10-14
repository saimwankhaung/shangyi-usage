const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
(async () => {
  if (process.platform === 'darwin') { await require('./package-macos.cjs'); return; }
  if (process.platform !== 'win32') throw new Error('Package on Windows or macOS, or use npm run package:mac for a macOS ZIP.');
  const electronExe = require('electron');
  const runtime = path.dirname(electronExe);
  const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
  const destination = path.join(root, 'dist', `ShanGyi-Usage-${version}-win-x64`);
  const resource = path.join(destination, 'resources', 'app');
  if (!path.resolve(resource).startsWith(path.resolve(root, 'dist') + path.sep)) throw new Error('Unexpected package output path.');
  await fs.rm(resource, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  await fs.cp(runtime, destination, { recursive: true, filter: file => !['default_app.asar', 'debug.log'].includes(path.basename(file)) });
  await fs.copyFile(path.join(runtime, 'LICENSE'), path.join(destination, 'LICENSE.electron.txt'));
  const renamed = path.join(destination, 'ShanGyi Usage.exe');
  await fs.copyFile(path.join(destination, 'electron.exe'), renamed);
  await fs.unlink(path.join(destination, 'electron.exe'));
  const { rcedit } = await import('rcedit');
  await rcedit(renamed, { icon: path.join(root, 'app/assets/icon.ico'),
    'file-version': `${version}.0`, 'product-version': `${version}.0`,
    'version-string': { ProductName: 'ShanGyi Usage', FileDescription: 'ShanGyi Usage desktop companion',
      CompanyName: 'ShanGyi', LegalCopyright: 'Copyright (c) 2026 ShanGyi. MIT License; Electron (c) GitHub Inc. and contributors.',
      OriginalFilename: 'ShanGyi Usage.exe', InternalName: 'ShanGyi Usage' } });
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/build-vscode-wrapper.ps1'),
    '-Destination', path.join(destination, 'ShanGyiClaudeBridge.exe')], { stdio: 'inherit', windowsHide: true });
  await fs.mkdir(resource, { recursive: true });
  await fs.cp(path.join(root, 'app'), path.join(resource, 'app'), { recursive: true });
  await fs.copyFile(path.join(root, 'package.json'), path.join(resource, 'package.json'));
  await fs.mkdir(path.join(resource, 'node_modules'), { recursive: true });
  await fs.cp(path.join(root, 'node_modules/jsonc-parser'), path.join(resource, 'node_modules/jsonc-parser'), { recursive: true });
  for (const file of ['README.md', 'README.my.md', 'README.th.md', 'LICENSE', 'ASSETS.md', 'BRAND-ASSETS-LICENSE.md', 'CHANGELOG.md']) await fs.copyFile(path.join(root, file), path.join(destination, file));
  // README images only; the HTML they are rendered from stays in the repository.
  await fs.cp(path.join(root, 'docs'), path.join(destination, 'docs'), { recursive: true, filter: file => !file.startsWith(path.join(root, 'docs', 'source')) });
  await fs.copyFile(path.join(root, 'Setup VS Code Bridge.cmd'), path.join(destination, 'Setup VS Code Bridge.cmd'));
  console.log(destination);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
