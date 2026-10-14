const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { findClaudeCLI, findCodexCLI } = require('../app/cli-discovery.cjs');
async function fixture(t) {
  const parent = path.resolve(__dirname, '../test-results'); await fs.mkdir(parent, { recursive: true });
  const home = await fs.mkdtemp(path.join(parent, 'cli-discovery-'));
  t.after(() => fs.rm(home, { recursive: true, force: true })); return home;
}
async function executable(file) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'fixture', { mode: 0o755 }); return file; }
test('Mac discovers Claude native install without VS Code or shell PATH', async t => {
  const home = await fixture(t), file = await executable(path.join(home, '.local/bin/claude'));
  assert.equal(findClaudeCLI(home, { platform: 'darwin', searchDirs: [] }), file);
});
test('Mac VS Code detection chooses the latest version and supports architecture-specific layouts', async t => {
  const home = await fixture(t);
  await executable(path.join(home, '.vscode/extensions/anthropic.claude-code-2.1.9-darwin-arm64/resources/native-binary/claude'));
  const newest = await executable(path.join(home, '.vscode/extensions/anthropic.claude-code-2.1.20-darwin-arm64/resources/native-binaries/darwin-arm64/claude'));
  assert.equal(findClaudeCLI(home, { platform: 'darwin', arch: 'arm64', searchDirs: [] }), newest);
});
test('Mac detects Codex in Applications and Homebrew paths; missing installations stay explicit', async t => {
  const home = await fixture(t), applications = path.join(home, 'Applications'), bin = path.join(home, 'brew/bin');
  const file = await executable(path.join(applications, 'Codex.app/Contents/Resources/codex'));
  assert.equal(findCodexCLI(home, { platform: 'darwin', applicationsDirs: [applications], searchDirs: [] }), file);
  const cli = await executable(path.join(bin, 'codex'));
  assert.equal(findCodexCLI(home, { platform: 'darwin', applicationsDirs: [], searchDirs: [bin] }), cli);
  assert.equal(findClaudeCLI(home, { platform: 'darwin', searchDirs: [] }), null);
  assert.equal(findCodexCLI(home, { platform: 'darwin', applicationsDirs: [], searchDirs: [] }), 'codex');
});
test('Windows retains extension exe and bundled Codex detection', async t => {
  const home = await fixture(t);
  const claude = await executable(path.join(home, '.vscode/extensions/anthropic.claude-code-2.1.20-win32-x64/resources/native-binary/claude.exe'));
  assert.equal(findClaudeCLI(home, { platform: 'win32', searchDirs: [] }), claude);
  const windowsBin = path.join(home, 'Codex/bin'), codex = await executable(path.join(windowsBin, 'current/codex.exe'));
  assert.equal(findCodexCLI(home, { platform: 'win32', windowsBin, searchDirs: [] }), codex);
});
