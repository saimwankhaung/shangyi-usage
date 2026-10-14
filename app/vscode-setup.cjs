const fs = require('node:fs/promises');
const path = require('node:path');
const { parse, modify, applyEdits } = require('jsonc-parser');
const SETTING = 'claudeCode.claudeProcessWrapper';
async function readConfig(settingsFile) {
  let body;
  try { body = await fs.readFile(settingsFile, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; body = '{}\n'; }
  const errors = [];
  const config = parse(body.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true });
  if (errors.length || !config || typeof config !== 'object' || Array.isArray(config)) throw new Error('VS Code settings.json could not be parsed. Fix the settings file before connecting.');
  return { body, config };
}
async function bridgeStatus({ settingsFile, wrapperPath }) {
  try { const { config } = await readConfig(settingsFile); return { configured: config[SETTING] === wrapperPath }; }
  catch { return { configured: false }; }
}
async function installVSCodeBridge({ settingsFile, dataDir, wrapperPath, replaceExisting = false }) {
  await fs.access(wrapperPath).catch(() => { throw new Error('The VS Code helper is missing. Extract the entire Windows ZIP before connecting.'); });
  const { body, config } = await readConfig(settingsFile);
  const previous = config[SETTING];
  const backupFile = path.join(dataDir, 'vscode-wrapper-backup.json');
  let savedBackup;
  try { savedBackup = JSON.parse(await fs.readFile(backupFile, 'utf8')); } catch { }
  const managed = Boolean(savedBackup && savedBackup.installedWrapper === previous);
  if (previous && previous !== wrapperPath && !managed && !replaceExisting) return { needsConfirmation: true };
  await fs.mkdir(dataDir, { recursive: true });
  if (previous !== wrapperPath) await fs.writeFile(backupFile, JSON.stringify({ previous: managed ? savedBackup.previous : previous ?? null, installedWrapper: wrapperPath }));
  const next = applyEdits(body, modify(body, [SETTING], wrapperPath, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
  await fs.mkdir(path.dirname(settingsFile), { recursive: true });
  await fs.writeFile(settingsFile, next);
  return { connected: true };
}
async function removeVSCodeBridge({ settingsFile, dataDir }) {
  const backupFile = path.join(dataDir, 'vscode-wrapper-backup.json');
  let backup;
  try { backup = JSON.parse(await fs.readFile(backupFile, 'utf8')); }
  catch { return { restored: false, message: 'No VS Code bridge backup was found.' }; }
  const { body, config } = await readConfig(settingsFile);
  if (config[SETTING] !== backup.installedWrapper) return { restored: false, message: 'Your VS Code wrapper setting was changed after setup, so it was left as it is.' };
  const next = applyEdits(body, modify(body, [SETTING], backup.previous ?? undefined, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
  await fs.writeFile(settingsFile, next);
  await fs.unlink(backupFile);
  return { restored: true };
}
module.exports = { installVSCodeBridge, removeVSCodeBridge, bridgeStatus, readConfig, SETTING };
