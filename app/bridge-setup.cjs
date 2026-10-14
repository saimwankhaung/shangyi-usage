const fs = require('node:fs/promises');
const path = require('node:path');

function shellQuote(value) {
  if (/[\r\n"]/.test(value)) throw new Error('The installation path contains unsupported characters.');
  return `"${value}"`;
}
function bridgeCommand(scriptPath, snapshotPath) {
  return `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ${shellQuote(scriptPath.replaceAll('\\', '/'))} -SnapshotPath ${shellQuote(snapshotPath.replaceAll('\\', '/'))}`;
}
async function readSettings(file) {
  try { return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('Claude settings could not be parsed. Fix settings.json before connecting.'); }
}
async function installBridge({ settingsFile, dataDir, sourceScript, replaceExisting = false }) {
  const settings = await readSettings(settingsFile);
  const scriptPath = path.join(dataDir, 'claude-statusline.ps1');
  const snapshotPath = path.join(dataDir, 'claude-snapshot.json');
  const command = bridgeCommand(scriptPath, snapshotPath);
  const previous = settings.statusLine;
  if (previous && previous.command !== command && !replaceExisting) return { needsConfirmation: true };
  await fs.mkdir(dataDir, { recursive: true });
  await fs.copyFile(sourceScript, scriptPath);
  const backupFile = path.join(dataDir, 'claude-statusline-backup.json');
  // Preserve the original status line once. Reconnecting must not replace its backup.
  if (previous?.command !== command) {
    await fs.writeFile(backupFile, JSON.stringify({ previous: previous ?? null, installedCommand: command }, null, 2));
  }
  settings.statusLine = { type: 'command', command, padding: previous?.padding ?? 0 };
  await fs.mkdir(path.dirname(settingsFile), { recursive: true });
  await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2) + '\n');
  return { connected: true, command };
}
async function removeBridge({ settingsFile, dataDir }) {
  const backupFile = path.join(dataDir, 'claude-statusline-backup.json');
  let backup;
  try { backup = JSON.parse(await fs.readFile(backupFile, 'utf8')); }
  catch { return { restored: false, message: 'No bridge backup was found. Your Claude settings were left as they are.' }; }
  const settings = await readSettings(settingsFile);
  if (settings.statusLine?.command !== backup.installedCommand) return { restored: false,
    message: 'Your Claude status line has changed since setup. It was left as it is.' };
  if (backup.previous === null) delete settings.statusLine;
  else settings.statusLine = backup.previous;
  await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2) + '\n');
  await fs.unlink(backupFile);
  await fs.unlink(path.join(dataDir, 'claude-snapshot.json')).catch(() => {});
  return { restored: true };
}
module.exports = { installBridge, removeBridge, bridgeCommand };
