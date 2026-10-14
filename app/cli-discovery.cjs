const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function isExecutable(file, platform) {
  try { if (!fs.statSync(file).isFile()) return false; if (platform !== 'win32') fs.accessSync(file, fs.constants.X_OK); return true; }
  catch { return false; }
}
function executableDirs(home, platform, pathValue = process.env.PATH || '') {
  const standard = platform === 'win32' ? [] : [path.join(home, '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', path.join(home, '.npm-global/bin')];
  return [...standard, ...pathValue.split(platform === 'win32' ? ';' : ':').filter(Boolean)];
}
function cliEnv() {
  if (process.platform !== 'darwin') return { ...process.env };
  return { ...process.env, PATH: [...new Set(executableDirs(os.homedir(), 'darwin'))].join(':') };
}
function findClaudeCLI(home = os.homedir(), options = {}) {
  const platform = options.platform || process.platform, arch = options.arch || process.arch;
  const binary = platform === 'win32' ? 'claude.exe' : 'claude';
  const extensions = path.join(home, '.vscode/extensions');
  try {
    const names = fs.readdirSync(extensions).filter(name => name.startsWith('anthropic.claude-code-'))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const name of names) for (const relative of [`resources/native-binary/${binary}`, `resources/native-binaries/${platform}-${arch}/${binary}`]) {
      const file = path.join(extensions, name, relative);
      if (isExecutable(file, platform)) return file;
    }
  } catch { /* The standalone CLI works without VS Code. */ }
  const standalone = path.join(home, '.local/bin', binary);
  if (isExecutable(standalone, platform)) return standalone;
  for (const dir of options.searchDirs || executableDirs(home, platform, options.pathValue)) {
    const file = path.join(dir, binary);
    if (isExecutable(file, platform)) return file;
  }
  return null;
}
function findCodexCLI(home = os.homedir(), options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'win32') {
    const bin = options.windowsBin || path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData/Local'), 'OpenAI/Codex/bin');
    try {
      const files = fs.readdirSync(bin).map(folder => path.join(bin, folder, 'codex.exe')).filter(file => isExecutable(file, platform))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      if (files.length) return files[0];
    } catch { /* CLI on PATH is supported. */ }
  }
  if (platform === 'darwin') {
    for (const applications of options.applicationsDirs || ['/Applications', path.join(home, 'Applications')]) {
      for (const name of ['Codex.app', 'ChatGPT.app']) {
        const file = path.join(applications, name, 'Contents/Resources/codex');
        if (isExecutable(file, platform)) return file;
      }
    }
  }
  const binary = platform === 'win32' ? 'codex.exe' : 'codex';
  for (const dir of options.searchDirs || executableDirs(home, platform, options.pathValue)) {
    const file = path.join(dir, binary);
    if (isExecutable(file, platform)) return file;
  }
  return 'codex';
}
module.exports = { findClaudeCLI, findCodexCLI, cliEnv };
