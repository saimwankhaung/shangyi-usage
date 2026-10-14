const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { installVSCodeBridge } = require('./vscode-setup.cjs');

async function install(wrapperPath, appDataDir) {
  const appData = appDataDir || process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const dataDir = path.join(appData, 'ShanGyi Usage');
  const settingsFile = path.join(appData, 'Code', 'User', 'settings.json');
  const result = await installVSCodeBridge({ settingsFile, dataDir, wrapperPath: path.resolve(wrapperPath) });
  if (result.needsConfirmation) throw new Error('An existing VS Code wrapper needs to be reviewed through the widget Settings.');
  const widgetFile = path.join(dataDir, 'settings.json');
  let widget = {};
  try { widget = JSON.parse(await fs.readFile(widgetFile, 'utf8')); } catch { }
  widget.claudeSource = 'vscode';
  await fs.writeFile(widgetFile, JSON.stringify(widget, null, 2));
  return { connected: true, source: 'vscode', requiresVSCodeReload: true };
}
module.exports = { install };
if (require.main === module) {
  if (!process.argv[2]) { console.error('Provide the ShanGyiClaudeBridge.exe path.'); process.exitCode = 1; }
  else install(process.argv[2]).then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
