const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, Notification, dialog, shell, screen } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { CodexClient } = require('./providers/codex.cjs');
const { readClaude } = require('./providers/claude.cjs');
const { findClaudeCLI, readClaudeAccount } = require('./providers/claude-cli.cjs');
const { LimitReminders } = require('./reminders.cjs');
const { findCodexCLI } = require('./cli-discovery.cjs');
const i18n = require('./renderer/i18n.js');
const { providerStatus, demoProviders, mascotReaction } = require('./model.cjs');
const { installBridge, removeBridge } = require('./bridge-setup.cjs');
const { installVSCodeBridge, removeVSCodeBridge, bridgeStatus } = require('./vscode-setup.cjs');
const { MASCOT, COMPACT, layoutFor, compactBounds, mascotInCompact } = require('./window-layout.cjs');

app.setName('ShanGyi Usage');
if (process.platform === 'win32') app.setAppUserModelId('org.shangyi.usage');
const profileArg = process.argv.find(arg => arg.startsWith('--profile='));
if (profileArg) app.setPath('userData', path.resolve(profileArg.slice('--profile='.length)));
const testing = process.argv.includes('--test');
const cliDemo = process.argv.includes('--demo');
const defaults = { alwaysOnTop: true, animations: true, notifications: true, launchAtLogin: false,
  refreshSeconds: 60, locale: 'en', compact: true, codexPath: '', demo: cliDemo,
  claudeSource: process.platform === 'darwin' || fs.existsSync(path.join(os.homedir(), '.vscode', 'extensions')) ? 'vscode' : 'terminal' };
let settings = { ...defaults };
const L = message => i18n.localizeMessage(settings.locale, message);
let win, tray, client, pollTimer, watchTimer, layout, busy = false, stopping = false;
let providers = [
  { id: 'claude', name: 'Claude', status: 'disconnected', windows: [], observedAt: null, source: 'Claude Code status line', message: L('Connect Claude Code in Settings.') },
  { id: 'codex', name: 'Codex', status: 'connecting', windows: [], observedAt: null, source: 'Codex App Server', message: L('Connecting to your Codex account…') }
];
let claudeConfigured = false, claudeDirect = false;
let reminders = new LimitReminders(), reminderSave = Promise.resolve();
const dataDir = () => app.getPath('userData');
const settingsFile = () => path.join(dataDir(), 'settings.json');
const snapshotFile = () => path.join(dataDir(), settings.claudeSource === 'vscode' ? 'claude-vscode-snapshot.json' : 'claude-snapshot.json');
const claudeSettingsFile = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'settings.json');
const vscodeSettingsFile = () => testing ? path.join(dataDir(), 'test-vscode-settings.json')
  : path.join(process.env.APPDATA || app.getPath('appData'), 'Code', 'User', 'settings.json');
const wrapperPath = () => app.isPackaged ? path.join(path.dirname(process.execPath), 'ShanGyiClaudeBridge.exe')
  : path.join(__dirname, '..', 'dist', `ShanGyi-Usage-${app.getVersion()}-win-x64`, 'ShanGyiClaudeBridge.exe');
async function readCurrentClaude({ fetch = false } = {}) {
  if (settings.claudeSource === 'vscode') claudeConfigured = claudeDirect || (process.platform === 'win32' && (await bridgeStatus({ settingsFile: vscodeSettingsFile(), wrapperPath: wrapperPath() })).configured);
  else {
    try { const config = JSON.parse(await fsp.readFile(claudeSettingsFile(), 'utf8')); claudeConfigured = Boolean(config.statusLine?.command?.includes('claude-statusline.ps1')); }
    catch { claudeConfigured = false; }
  }
  const cached = await readClaude(snapshotFile(), { configured: claudeConfigured, source: settings.claudeSource });
  if (fetch && !testing && settings.claudeSource === 'vscode') {
    const executable = findClaudeCLI();
    if (executable) {
      try {
        const snapshot = await readClaudeAccount(executable);
        await fsp.mkdir(dataDir(), { recursive: true });
        const temporary = snapshotFile() + '.tmp';
        await fsp.writeFile(temporary, JSON.stringify(snapshot));
        await fsp.rename(temporary, snapshotFile());
        claudeDirect = true; claudeConfigured = true;
        return readClaude(snapshotFile(), { configured: true, source: settings.claudeSource });
      } catch (error) {
        if (cached.windows.length) return { ...cached, status: 'stale', message: error.message };
        return { ...cached, status: 'error', message: error.message };
      }
    }
  }
  return cached;
}

function state() {
  const current = settings.demo ? demoProviders() : providers;
  return { providers: current.map(provider => ({ ...provider, displayStatus: providerStatus(provider) })),
    settings, platform: process.platform, busy, claudeConfigured, claudeDirect, claudeAutoAvailable: !testing && Boolean(findClaudeCLI()), mascot: mascotReaction(current), demo: settings.demo, visible: testing || Boolean(win?.isVisible()), version: app.getVersion(), layout };
}
function publish() {
  if (win && !win.isDestroyed()) win.webContents.send('state:update', state());
  const current = state();
  const tooltip = current.providers.map(p => `${p.name}: ${p.windows.length ? p.windows.map(w => Math.round(w.usedPercent) + '%').join(' / ') : p.displayStatus}`).join('\n');
  tray?.setToolTip(`ShanGyi Usage${current.demo ? ' · DEMO' : ''}\n${tooltip}`);
}
function notifyLimits(provider) {
  if (settings.demo || providerStatus(provider) !== 'live') return;
  const alerts = reminders.consume(provider, { enabled: settings.notifications && !testing && Notification.isSupported() });
  const snapshot = JSON.stringify(reminders.snapshot());
  reminderSave = reminderSave.then(async () => {
    await fsp.mkdir(dataDir(), { recursive: true });
    const file = path.join(dataDir(), 'reminders.json');
    await fsp.writeFile(file + '.tmp', snapshot);
    await fsp.rename(file + '.tmp', file);
  }).catch(() => {});
  if (alerts.length) {
    new Notification({ title: `${provider.name} · ${L(alerts.some(row => row.level === 100) ? 'Limit reached' : 'Usage reminder')}`,
      body: alerts.map(row => `${i18n.quotaLabel(row, settings.locale)}: ${Math.round(row.usedPercent)}% ${i18n.text(settings.locale, 'used')}`).join('\n'),
      icon: path.join(__dirname, 'assets', 'icon.png') }).show();
  }
}
function updateProvider(value) {
  const previous = providers.find(p => p.id === value.id);
  if (value.id === 'claude' && value.windows.length && value.source !== 'Claude Code account usage' && !value.plan) value = { ...value, plan: previous?.plan || null };
  providers = providers.map(p => p.id === value.id ? value : p);
  notifyLimits(value);
  const reset = value.windows.some(row => previous?.windows.some(old => old.id === row.id && old.resetsAt
    && old.resetsAt * 1000 <= Date.now() && row.resetsAt > old.resetsAt && row.usedPercent < old.usedPercent));
  publish();
  if (reset && settings.animations && win && !win.isDestroyed()) win.webContents.send('state:update', { ...state(), mascot: 'Celebrate', reactionOnce: true });
}
function defaultCodexPath() { return findCodexCLI(); }
function getClient() {
  if (!client) {
    client = new CodexClient(settings.codexPath || defaultCodexPath());
    client.on('update', updateProvider);
    client.on('connection-error', () => {});
  }
  return client;
}
async function refresh() {
  if (busy || stopping) return state();
  if (settings.demo) { publish(); return state(); }
  busy = true;
  publish();
  await Promise.allSettled([
    readCurrentClaude({ fetch: true }).then(updateProvider),
    getClient().readUsage().then(updateProvider).catch(error => {
      const previous = providers.find(p => p.id === 'codex');
      updateProvider({ ...previous, status: previous.windows.length ? 'stale' : 'error',
        message: error.message, lastAttemptAt: Date.now() });
      client?.stop();
      client = null;
    })
  ]);
  busy = false;
  publish();
  return state();
}
function polling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(refresh, settings.refreshSeconds * 1000);
}
async function persistSettings() {
  await fsp.mkdir(dataDir(), { recursive: true });
  const { demo, ...persisted } = settings;
  await fsp.writeFile(settingsFile(), JSON.stringify(persisted, null, 2));
}
// Screen position of the mascot box; it stays fixed while the panel opens and closes.
function mascotPosition() {
  const [x, y] = win.getPosition();
  const offset = layout?.mascot || { x: COMPACT.left, y: COMPACT.top };
  return { x: x + offset.x, y: y + offset.y };
}
function placeWindow(mascot, prefer) {
  const workArea = screen.getDisplayMatching({ ...mascot, width: MASCOT, height: MASCOT }).workArea;
  layout = layoutFor({ compact: settings.compact, mascot, workArea, prefer });
  if (!win) return;
  // The renderer receives the layout first and applies it when the resize lands.
  publish();
  // Windows pins min/max size for non-resizable windows. Release it for this transition.
  win.setResizable(true);
  win.setBounds(layout.bounds, false);
  win.setResizable(false);
}
function setSize(compact) {
  settings.compact = Boolean(compact);
  if (!win) return;
  win.setIgnoreMouseEvents(false);
  placeWindow(mascotPosition());
}
async function changeCompact(compact) {
  // Show the requested view even if saving preferences is slow or fails.
  setSize(compact);
  try { await persistSettings(); }
  catch { win?.webContents.send('ui:notice', L('Settings could not be saved.')); }
  return state();
}
function keepOnScreen() {
  if (!win) return;
  // Bring the mascot back onto a display, then lay the window out around it again.
  const home = compactBounds(mascotPosition());
  const area = screen.getDisplayMatching(home).workArea;
  placeWindow(mascotInCompact({ x: Math.max(area.x, Math.min(home.x, area.x + area.width - home.width)),
    y: Math.max(area.y, Math.min(home.y, area.y + area.height - home.height)) }), layout?.placement);
}
function menu() {
  return Menu.buildFromTemplate([
    { label: L('Show ShanGyi'), click: () => { win.show(); win.focus(); } },
    { label: L('Refresh usage'), click: refresh },
    { label: L('Usage details'), type: 'checkbox', checked: !settings.compact, click: item => {
      // Let a visible panel play its closing animation before the window shrinks.
      if (!item.checked && win.isVisible()) win.webContents.send('ui:collapse'); else changeCompact(!item.checked);
    } },
    { label: L('Settings…'), click: () => { setSize(false); win.show(); win.focus(); publish(); win.webContents.send('ui:settings'); } },
    { label: L('Always on top'), type: 'checkbox', checked: settings.alwaysOnTop, click: async item => { settings.alwaysOnTop = item.checked; applyOnTop(); await persistSettings(); publish(); } },
    { type: 'separator' }, { label: L('Quit'), click: () => app.quit() }
  ]);
}
// On macOS a full-screen app gets its own Space, and an always-on-top window stays behind on the
// desktop Space. Joining every Space with visibleOnFullScreen (NSWindowCollectionBehavior
// canJoinAllSpaces + fullScreenAuxiliary) keeps the widget over full-screen apps too. The dock icon
// is already hidden, so the process-type switch Electron would otherwise do is skipped (it would
// flash the window and bring the dock icon back).
function applyOnTop() {
  win.setAlwaysOnTop(settings.alwaysOnTop, 'floating');
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(settings.alwaysOnTop, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }
}
function validateSettings(input) {
  const value = {};
  for (const key of ['alwaysOnTop', 'animations', 'notifications', 'launchAtLogin', 'demo']) {
    if (typeof input?.[key] === 'boolean') value[key] = input[key];
  }
  if (['en', 'my', 'th'].includes(input?.locale)) value.locale = input.locale;
  if (['terminal', 'vscode'].includes(input?.claudeSource)) value.claudeSource = process.platform === 'darwin' ? 'vscode' : input.claudeSource;
  if ([30, 60, 120, 300].includes(input?.refreshSeconds)) value.refreshSeconds = input.refreshSeconds;
  return value;
}
function ipc() {
  ipcMain.handle('state:get', () => state());
  ipcMain.handle('usage:refresh', refresh);
  ipcMain.handle('settings:save', async (_, input) => {
    const previousDemo = settings.demo;
    const previousClaudeSource = settings.claudeSource;
    settings = { ...settings, ...validateSettings(input) };
    applyOnTop();
    if (!testing) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, path: process.execPath });
    if (settings.demo && !previousDemo) { client?.stop(); client = null; }
    await persistSettings();
    polling();
    publish();
    if (!settings.demo && previousDemo) refresh();
    if (previousClaudeSource !== settings.claudeSource) { claudeDirect = false; updateProvider(await readCurrentClaude({ fetch: true })); }
    return state();
  });
  ipcMain.handle('codex:choose', async () => {
    const selection = await dialog.showOpenDialog(win, { title: L('Choose the Codex CLI executable'),
      properties: ['openFile'], filters: process.platform === 'win32' ? [{ name: 'Executable', extensions: ['exe'] }] : [] });
    if (!selection.canceled && selection.filePaths[0]) {
      settings.codexPath = selection.filePaths[0];
      client?.stop(); client = null;
      await persistSettings();
      refresh();
    }
    return state();
  });
  ipcMain.handle('claude:connect', async () => {
    if (settings.claudeSource === 'vscode') {
      if (!testing && findClaudeCLI()) {
        const value = await readCurrentClaude({ fetch: true }); updateProvider(value);
        return value.status === 'error' || value.status === 'stale' ? { error: value.message }
          : { connected: true, message: L('Claude account connected. Usage refreshes automatically.') };
      }
      if (process.platform !== 'win32') return { error: 'Install Claude Code and sign in to read usage automatically on macOS.' };
      const options = { settingsFile: vscodeSettingsFile(), dataDir: dataDir(), wrapperPath: wrapperPath() };
      try {
        let result = await installVSCodeBridge(options);
        if (result.needsConfirmation) {
          const answer = await dialog.showMessageBox(win, { type: 'question', title: L('Back up the existing VS Code wrapper'),
            message: L('Claude Code already has a process wrapper configured in VS Code.'),
            detail: L('Connecting will back up and replace only claudeCode.claudeProcessWrapper. Restore can put it back. Your other VS Code settings and comments are preserved.'),
            buttons: [L('Cancel'), L('Back up and connect')], defaultId: 0, cancelId: 0 });
          if (answer.response !== 1) return { canceled: true };
          result = await installVSCodeBridge({ ...options, replaceExisting: true });
        }
        updateProvider(await readCurrentClaude());
        return { connected: true, message: L('VS Code bridge configured. Save your work and run Developer: Reload Window in VS Code, then use Claude Code normally. Usage appears when the extension reports quota events.') };
      } catch (error) { return { error: error.message }; }
    }
    if (process.platform !== 'win32') return { error: 'Install Claude Code and sign in to read usage automatically on macOS.' };
    const options = { settingsFile: claudeSettingsFile(), dataDir: dataDir(),
      sourceScript: path.join(__dirname, 'bridge', 'claude-statusline.ps1') };
    try {
      let result = await installBridge(options);
      if (result.needsConfirmation) {
        const answer = await dialog.showMessageBox(win, { type: 'question', title: L('Keep a backup of your Claude status line'),
          message: L('Claude Code already has a custom status line.'),
          detail: L('Connecting will replace it with the ShanGyi usage status line. Its original setting is backed up and can be restored with Disconnect. All other Claude settings stay as they are.'),
          buttons: [L('Cancel'), L('Back up and connect')], defaultId: 0, cancelId: 0 });
        if (answer.response !== 1) return { canceled: true };
        result = await installBridge({ ...options, replaceExisting: true });
      }
      await refresh();
      return { connected: true, message: L('Bridge connected. Open Claude Code and run a normal turn to receive usage. Project-level status-line settings can override the bridge.') };
    } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle('claude:disconnect', async () => {
    if (settings.claudeSource === 'vscode') {
      const result = await removeVSCodeBridge({ settingsFile: vscodeSettingsFile(), dataDir: dataDir() });
      if (result.restored) await fsp.unlink(snapshotFile()).catch(() => {});
      updateProvider(await readCurrentClaude());
      return result;
    }
    const result = await removeBridge({ settingsFile: claudeSettingsFile(), dataDir: dataDir() });
    updateProvider(await readCurrentClaude());
    return result;
  });
  ipcMain.handle('usage:open', async (_, provider) => {
    const links = { claude: 'https://claude.ai/settings/usage', codex: 'https://chatgpt.com/codex/settings/usage' };
    if (links[provider]) await shell.openExternal(links[provider]);
  });
  ipcMain.handle('window:compact', (_, compact) => changeCompact(compact === true));
  // After the mascot is dropped, keep the open panel on screen: same side if it still fits.
  ipcMain.handle('window:settle', () => { if (!settings.compact) placeWindow(mascotPosition(), layout?.placement); return state(); });
  ipcMain.handle('window:hide', () => win.hide());
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('window:menu', () => tray.popUpContextMenu(menu()));
  ipcMain.on('window:passthrough', (_, enabled) => {
    // A quick first click must not wait for a forwarded hover event to arrive.
    if (typeof enabled === 'boolean') win.setIgnoreMouseEvents(!settings.compact && enabled, { forward: true });
  });
  ipcMain.on('window:move', (_, delta) => {
    if (!delta || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + Math.max(-500, Math.min(500, delta.x))), Math.round(y + Math.max(-500, Math.min(500, delta.y))), false);
  });
}

if (!testing && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { win?.show(); win?.focus(); });
  app.whenReady().then(async () => {
    if (process.platform === 'darwin') app.dock?.hide();
    try { reminders = new LimitReminders(JSON.parse(await fsp.readFile(path.join(dataDir(), 'reminders.json'), 'utf8'))); } catch { /* First launch or unavailable reminder history. */ }
    try { const saved = JSON.parse(await fsp.readFile(settingsFile(), 'utf8')); settings = { ...defaults, ...validateSettings(saved),
      compact: true, codexPath: typeof saved.codexPath === 'string' ? saved.codexPath : '',
      position: saved.position, demo: cliDemo }; } catch { /* First launch. */ }
    if (process.platform === 'darwin') settings.claudeSource = 'vscode';
    const workArea = screen.getPrimaryDisplay().workArea;
    // settings.position is where the mascot-only window sits; the mascot is placed from it.
    const home = Number.isFinite(settings.position?.x) && Number.isFinite(settings.position?.y) ? settings.position
      : { x: workArea.x + workArea.width - 330, y: workArea.y + workArea.height - 256 };
    layout = layoutFor({ compact: true, mascot: mascotInCompact(home), workArea });
    win = new BrowserWindow({ ...layout.bounds,
      frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, maximizable: false,
      fullscreenable: false, show: false, alwaysOnTop: settings.alwaysOnTop, skipTaskbar: true,
      title: L('ShanGyi Usage'), icon: path.join(__dirname, 'assets', 'icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
        nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: false, offscreen: testing, devTools: testing } });
    applyOnTop();
    keepOnScreen();
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
    win.on('close', event => { if (!stopping) { event.preventDefault(); win.hide(); } });
    win.on('show', () => { win.setIgnoreMouseEvents(false); publish(); });
    win.on('hide', publish);
    let saveMove;
    win.on('moved', () => { clearTimeout(saveMove); saveMove = setTimeout(() => {
      const { x, y } = compactBounds(mascotPosition()); settings.position = { x, y }; persistSettings().catch(() => {});
    }, 500); });
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 24, height: 24 });
    tray = new Tray(icon);
    tray.setToolTip('ShanGyi Usage');
    tray.on('click', () => { if (win.isVisible()) win.hide(); else { win.show(); win.focus(); } });
    tray.on('right-click', () => tray.popUpContextMenu(menu()));
    ipc();
    await win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    if (!testing) win.show();
    publish();
    if (!testing) refresh();
    polling();
    let previousStamp = 0;
    watchTimer = setInterval(async () => {
      if (settings.demo || stopping) return;
      try {
        const stats = await fsp.stat(snapshotFile());
        if (stats.mtimeMs !== previousStamp) { previousStamp = stats.mtimeMs; updateProvider(await readCurrentClaude()); }
      } catch { /* No bridge snapshot yet. */ }
    }, 1500);
    screen.on('display-metrics-changed', keepOnScreen);
    screen.on('display-removed', keepOnScreen);
  });
}
app.on('before-quit', () => { stopping = true; clearInterval(pollTimer); clearInterval(watchTimer); client?.stop(); tray?.destroy(); });
app.on('window-all-closed', () => { if (stopping) app.quit(); });
