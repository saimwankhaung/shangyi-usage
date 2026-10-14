const $ = id => document.getElementById(id);
let current, settingsOpen = false, reactionTimer, currentReaction = 'Idle_Happy', toastTimer;
const i18n = window.ShanGyiI18n;
const t = key => i18n.text(current?.settings.locale || 'en', key);
const localizedMessage = message => i18n.localizeMessage(current?.settings.locale || 'en', message);

function node(tag, className, value) { const element = document.createElement(tag); if (className) element.className = className; if (value !== undefined) element.textContent = value; return element; }
// Neutral glyphs: provider names are shown as text and their logos are not bundled.
const ICONS = {
  external: 'M14 3h7v7m0-7L10 14M10 3H4v17h17v-6',
  claude: 'M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 7h.01M12 11h.01M16 11h.01',
  codex: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 5 3 3-3 3m5 0h5'
};
function icon(type) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  element.setAttribute('viewBox', '0 0 24 24');
  const p = document.createElementNS(element.namespaceURI, 'path');
  p.setAttribute('d', ICONS[type] || 'M12 3v18M3 12h18');
  element.append(p); return element;
}
function countdown(seconds) { return i18n.countdown(seconds, current?.settings.locale); }
function resetText(row) {
  if (!row.resetsAt) return t('unknownReset');
  const seconds = row.resetsAt - Date.now() / 1000;
  return seconds <= 0 ? t('resetPending') : `${t('resets')} ${countdown(seconds)}`;
}
function age(timestamp) { return i18n.age(timestamp, current?.settings.locale); }
function statusFor(provider) {
  if (provider.status !== 'live') return provider.status;
  if (!provider.observedAt || Date.now() - provider.observedAt > 300000 || provider.windows.some(w => w.resetsAt && w.resetsAt * 1000 <= Date.now())) return 'stale';
  return 'live';
}
function rowLabel(row) { return i18n.quotaLabel(row, current.settings.locale); }
function renderProviders() {
  $('providers').replaceChildren();
  for (const provider of current.providers) {
    const status = statusFor(provider);
    const card = node('article', `provider ${provider.id}`);
    card.dataset.provider = provider.id;
    const header = node('div', 'provider-header');
    const symbol = node('span', `provider-symbol ${provider.id}`);
    symbol.setAttribute('aria-hidden', 'true'); symbol.append(icon(provider.id));
    header.append(symbol, node('span', 'provider-name', provider.name));
    const statusLabel = { live: provider.plan || t('liveBadge'), stale: t('stale'), waiting: t('waiting'), disconnected: t('disconnected'), connecting: t('connecting'), error: t('error'), unavailable: t('unavailable') };
    const connectedWaiting = provider.id === 'claude' && current.claudeConfigured && status === 'waiting';
    header.append(node('span', `provider-badge ${status}`, connectedWaiting ? t('connectedWaiting') : statusLabel[status] || status));
    const link = node('button', 'provider-link'); link.title = t('openUsage'); link.setAttribute('aria-label', `${provider.name} ${t('openUsage')}`); link.append(icon('external')); link.onclick = () => window.shangyi.openUsage(provider.id);
    header.append(link); card.append(header);
    for (const row of provider.windows) {
      if (provider.id === 'claude' && row.id === 'iguana_necktie') continue;
      const expired = row.resetsAt && row.resetsAt * 1000 <= Date.now();
      const usage = node('div', `usage-row ${expired || status === 'stale' ? 'expired' : row.usedPercent >= 95 ? 'critical' : row.usedPercent >= 80 ? 'warning' : ''}`);
      const heading = node('div', 'row-heading');
      const value = node('span', 'row-value', `${Math.round(row.usedPercent)}%`); value.append(node('small', '', t('used')));
      heading.append(node('span', 'row-label', rowLabel(row)), value);
      const progress = node('div', 'progress');
      progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-label', `${provider.name} ${rowLabel(row)}`);
      progress.setAttribute('aria-valuenow', Math.min(row.usedPercent, 100)); progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', '100');
      const fill = node('div', 'progress-fill'); fill.style.width = `${Math.min(100, row.usedPercent)}%`; progress.append(fill);
      const reset = node('div', 'reset-line');
      const resetLabel = node('span', 'reset-countdown', resetText(row)); resetLabel.dataset.resetsAt = row.resetsAt || '';
      if (row.resetsAt) resetLabel.title = new Date(row.resetsAt * 1000).toLocaleString(current.settings.locale === 'th' ? 'th-TH' : undefined);
      reset.append(resetLabel, node('span', 'remaining', `${Math.max(0, Math.round(100 - row.usedPercent))}% ${t('left')}`));
      usage.append(heading, progress, reset); card.append(usage);
    }
    if (!provider.windows.length) {
      const message = current.platform === 'darwin' && provider.id === 'claude' && !current.claudeAutoAvailable
        ? localizedMessage('Install Claude Code and sign in to read usage automatically on macOS.')
        : provider.id === 'claude' && current.settings.claudeSource === 'vscode'
        ? current.claudeAutoAvailable ? provider.message : t(current.claudeConfigured ? 'vscodeWaiting' : 'vscodeEmpty')
        : current.settings.locale === 'en' ? provider.message : t(provider.id + 'Empty');
      card.append(node('p', 'provider-message', localizedMessage(message)));
      const automatic = provider.id === 'claude' && current.settings.claudeSource === 'vscode' && current.claudeAutoAvailable;
      const action = node('button', 'connect-action', automatic ? t('refresh') : provider.id === 'claude' ? t(current.claudeConfigured ? 'connectionSettings' : 'connect') : t('configure'));
      action.onclick = automatic ? () => window.shangyi.refresh() : () => openSettings(); card.append(action);
    } else if (status === 'stale') {
      const detail = node('p', 'provider-message stale-message', t('staleMessage'));
      detail.title = localizedMessage(provider.message || provider.source); card.append(detail);
    }
    $('providers').append(card);
  }
}
function translateUI() {
  document.documentElement.lang = current.settings.locale;
  document.body.dataset.locale = current.settings.locale;
  $('hero-title').replaceChildren(...t('hero').split('\n').flatMap((line, index) => index ? [document.createElement('br'), document.createTextNode(line)] : [document.createTextNode(line)]));
  const ids = { subtitle: 'subtitle', 'refresh-text': 'refresh', 'settings-title': 'title', 'settings-back': 'done', 'top-label': 'top', 'animation-label': 'animation', 'notification-label': 'notifications', 'startup-label': 'startup', 'refresh-label': 'refreshEvery', 'language-label': 'language', 'demo-label': 'demo', 'connect-title': 'connectTitle', 'connect-description': 'connectDesc', 'restore-title': 'restoreTitle', 'restore-description': 'restoreDesc', 'bridge-note': 'bridgeNote', 'connect-claude': 'connect', 'disconnect-claude': 'restore', 'choose-codex': 'choose', 'demo-banner': 'demoBanner', 'quit-button': 'quit' };
  for (const [id, key] of Object.entries(ids)) $(id).textContent = t(key);
  for (const [id, key] of Object.entries({ 'settings-button': 'settings', 'hide-button': 'hide', 'compact-button': 'compactMode', 'expand-button': 'details', 'refresh-button': 'refresh' })) { $(id).title = t(key); $(id).setAttribute('aria-label', t(key)); }
  $('mascot-wrap').setAttribute('aria-label', t('mascotLabel'));
  $('panel').setAttribute('aria-label', t('monitor'));
  $('compact-demo').textContent = t('demoShort');
  for (const option of $('refresh-seconds').options) option.textContent = t({30:'sec30',60:'min1',120:'min2',300:'min5'}[option.value]);
  for (const option of $('claude-source').options) option.textContent = t(option.value === 'vscode' ? current.platform === 'darwin' ? 'accountOption' : 'vscodeOption' : 'terminalOption');
  const mac = current.platform === 'darwin';
  $('claude-source').querySelector('[value=terminal]').disabled = mac;
  $('disconnect-claude').closest('.setting-row').hidden = mac;
  $('claude-source-label').textContent = t('claudeSource');
  $('connect-claude').textContent = t(current.claudeConfigured ? 'reconnect' : 'connect');
  if (current.settings.claudeSource === 'vscode') {
    $('bridge-note').textContent = t('vscodeNote');
    $('connect-title').textContent = t('vscodeConnectTitle');
    $('connect-description').textContent = t('vscodeConnectDesc');
    $('restore-title').textContent = t('vscodeRestoreTitle');
    $('restore-description').textContent = t('vscodeRestoreDesc');
    if (current.claudeAutoAvailable || current.platform === 'darwin') {
      $('connect-title').textContent = t('claudeAccountTitle');
      $('connect-description').textContent = current.claudeAutoAvailable ? t('claudeAccountDesc') : localizedMessage('Install Claude Code and sign in to read usage automatically on macOS.');
      $('connect-claude').textContent = t('refresh');
      $('bridge-note').textContent = $('connect-description').textContent;
    }
  }
}
function updateFooter() {
  const anyLive = current.providers.some(p => statusFor(p) === 'live');
  $('hero-status').className = `connection${anyLive ? '' : ' offline'}`;
  $('hero-status').replaceChildren(node('i'), document.createTextNode(anyLive ? t('live') : t('offline')));
  const timestamps = current.providers.map(p => p.observedAt).filter(Boolean);
  $('last-updated').replaceChildren(node('i', `status-dot${anyLive ? ' live' : ''}`), document.createTextNode(timestamps.length ? `${t('source')} ${age(Math.max(...timestamps))}` : t('waitingUsage')));
  $('last-updated').title = current.providers.map(p => `${p.name}: ${age(p.observedAt)} · ${p.source || ''}`).join('\n');
  $('compact-values').replaceChildren(...current.providers.map(provider => {
    const entry = node('span', '', provider.name);
    const row = provider.windows[0];
    entry.append(node('b', '', row ? `${Math.round(row.usedPercent)}%${statusFor(provider) === 'stale' ? '*' : ''}` : '—'));
    return entry;
  }));
}
function reaction(name, once = false) {
  if (!/^(Idle_Happy|Hi_Wave|Thinking|Sleep|Celebrate|Confused|Thumbs_Up)$/.test(name)) return;
  const video = $('mascot');
  if (name !== currentReaction) { currentReaction = name; video.src = `../assets/mascot/ShanGyi_${name}.webm`; video.load(); }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (current?.settings.animations && !reduced && current?.visible !== false) video.play().catch(() => {}); else video.pause();
  if (once) { clearTimeout(reactionTimer); reactionTimer = setTimeout(() => { reactionTimer = null; reaction(current.mascot); }, 2400); }
}
// The main process sends each window layout just before it resizes the window.
// It is applied when the new size arrives, so the mascot never jumps on screen.
let layoutKey = '', pendingLayout = null, appliedLayout = null, layoutTimer, panelAnimation = null, closing = false;
const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
// A lightly damped spring (about 1.5% overshoot), like macOS window and popover motion.
const SPRING = (() => {
  const damping = 0.82, stiffness = 6.7, steps = 40, damped = stiffness * Math.sqrt(1 - damping * damping);
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const time = index / steps;
    return +(1 - Math.exp(-damping * stiffness * time) * (Math.cos(damped * time) + damping * stiffness / damped * Math.sin(damped * time))).toFixed(4);
  });
  points[steps] = 1;
  return `linear(${points.join(', ')})`;
})();
const openEasing = () => window.CSS?.supports?.('transition-timing-function', SPRING) ? SPRING : 'cubic-bezier(.2,.9,.3,1.03)';
function place(element, box) {
  element.style.left = `${box.x}px`; element.style.top = `${box.y}px`;
  element.style.width = `${box.width}px`; element.style.height = `${box.height}px`;
}
// Grow out of (or shrink back into) the edge of the panel that faces the mascot.
function animatePanel(kind) {
  const panel = $('panel'), layout = appliedLayout;
  // Closing during the opening animation starts from where the panel is now.
  const style = panelAnimation && getComputedStyle(panel);
  const from = style ? { transform: style.transform, opacity: style.opacity } : { transform: 'scale(1)', opacity: 1 };
  panelAnimation?.cancel(); panelAnimation = null;
  if (!layout?.panel || panel.hidden || reducedMotion() || typeof panel.animate !== 'function') return null;
  const box = layout.panel, mascot = layout.mascot;
  const x = Math.max(0, Math.min(box.width, mascot.x + mascot.width / 2 - box.x));
  const y = Math.max(0, Math.min(box.height, mascot.y + mascot.height / 2 - box.y));
  panel.style.transformOrigin = `${x}px ${y}px`;
  panelAnimation = kind === 'open'
    ? panel.animate([{ transform: 'scale(.2)', opacity: 0 }, { opacity: 1, offset: .3 }, { transform: 'scale(1)', opacity: 1 }], { duration: 460, easing: openEasing() })
    : panel.animate([from, { transform: 'scale(.2)', opacity: 0 }], { duration: 220, easing: 'cubic-bezier(.4,0,.8,.3)', fill: 'forwards' });
  return panelAnimation;
}
function applyLayout(layout) {
  pendingLayout = null; clearTimeout(layoutTimer);
  const opening = !layout.compact && (!appliedLayout || appliedLayout.compact || appliedLayout.placement !== layout.placement);
  appliedLayout = layout;
  document.body.classList.toggle('compact', layout.compact);
  document.body.dataset.placement = layout.placement;
  place($('hero'), layout.mascot);
  if (layout.panel) place($('panel'), layout.panel);
  const area = layout.panel || { x: 0, y: 0, width: layout.bounds.width, height: layout.bounds.height };
  const toast = $('toast');
  toast.style.left = `${area.x + 10}px`; toast.style.right = `${layout.bounds.width - area.x - area.width + 10}px`;
  toast.style.bottom = `${layout.bounds.height - area.y - area.height + 10}px`;
  $('panel').hidden = layout.compact;
  if (layout.compact) { panelAnimation?.cancel(); panelAnimation = null; }
  else if (opening) animatePanel('open');
}
function syncLayout() {
  if (!pendingLayout) return false;
  const { width, height } = pendingLayout.bounds;
  if (Math.abs(window.innerWidth - width) > 2 || Math.abs(window.innerHeight - height) > 2) return false;
  applyLayout(pendingLayout);
  return true;
}
function queueLayout(layout) {
  const key = JSON.stringify(layout);
  if (!layout || key === layoutKey) return;
  layoutKey = key; pendingLayout = layout;
  clearTimeout(layoutTimer);
  // The message and the resize can arrive in either order; give up waiting if the size never matches.
  if (!syncLayout()) layoutTimer = setTimeout(() => { if (pendingLayout) applyLayout(pendingLayout); }, 400);
}
window.addEventListener('resize', syncLayout);
function render(state) {
  current = state;
  queueLayout(state.layout);
  $('compact-panel').hidden = true;
  $('demo-banner').hidden = !state.demo;
  $('compact-panel').title = state.demo ? t('demoBanner') : '';
  $('compact-demo').hidden = !state.demo || !state.settings.compact;
  translateUI(); renderProviders(); updateFooter();
  $('refresh-button').classList.toggle('busy', state.busy);
  $('refresh-button').disabled = state.busy;
  $('always-on-top').checked = state.settings.alwaysOnTop;
  $('animations').checked = state.settings.animations;
  $('notifications').checked = state.settings.notifications;
  $('launch-at-login').checked = state.settings.launchAtLogin;
  $('demo').checked = state.demo;
  $('refresh-seconds').value = state.settings.refreshSeconds;
  $('locale').value = state.settings.locale;
  $('claude-source').value = state.settings.claudeSource;
  $('codex-path').textContent = state.settings.codexPath || t('auto');
  if (!reactionTimer || state.reactionOnce) reaction(state.mascot, state.reactionOnce);
}
function toast(message) { $('toast').textContent = localizedMessage(message); $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500); }
async function openSettings() {
  if (current.settings.compact) await window.shangyi.resize(false);
  settingsOpen = true; $('usage-view').hidden = true; $('settings-view').hidden = false;
}
function closeSettings() { settingsOpen = false; $('usage-view').hidden = false; $('settings-view').hidden = true; }
async function save() {
  try { render(await window.shangyi.saveSettings({ alwaysOnTop: $('always-on-top').checked, animations: $('animations').checked,
    notifications: $('notifications').checked, launchAtLogin: $('launch-at-login').checked,
    refreshSeconds: Number($('refresh-seconds').value), locale: $('locale').value, demo: $('demo').checked, claudeSource: $('claude-source').value })); }
  catch { toast('Settings could not be saved.'); }
}
$('settings-button').onclick = () => settingsOpen ? closeSettings() : openSettings();
$('settings-back').onclick = closeSettings;
$('hide-button').onclick = () => window.shangyi.hide();
$('quit-button').onclick = () => window.shangyi.quit();
$('refresh-button').onclick = () => window.shangyi.refresh();
$('compact-button').onclick = () => closeDetails();
$('expand-button').onclick = () => window.shangyi.resize(false);
for (const id of ['always-on-top', 'animations', 'notifications', 'launch-at-login', 'refresh-seconds', 'locale', 'demo', 'claude-source']) $(id).onchange = save;
$('choose-codex').onclick = async () => render(await window.shangyi.chooseCodex());
$('connect-claude').onclick = async () => {
  const button = $('connect-claude'); button.disabled = true;
  try {
    if (current.claudeAutoAvailable && current.settings.claudeSource === 'vscode') { await window.shangyi.refresh(); }
    else { const result = await window.shangyi.connectClaude(); if (!result.canceled) toast(result.error || result.message); }
  }
  catch { toast('Claude bridge setup could not finish.'); }
  finally { button.disabled = false; }
};
$('disconnect-claude').onclick = async () => { const result = await window.shangyi.disconnectClaude(); toast(result.restored ? 'Claude status line restored.' : result.message); };
const mascotWrap = $('mascot-wrap');
let drag;
mascotWrap.addEventListener('pointerdown', event => { if (event.button !== 0 || drag) return; drag = { pointerId: event.pointerId, x: event.screenX, y: event.screenY, moved: false }; mascotWrap.setPointerCapture(event.pointerId); });
mascotWrap.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.screenX - drag.x, dy = event.screenY - drag.y;
  if (Math.hypot(dx, dy) >= 6 || drag.moved) {
    drag.moved = true; window.shangyi.move({ x: dx, y: dy }); drag.x = event.screenX; drag.y = event.screenY;
  }
});
async function closeDetails() {
  if (!current || current.settings.compact || closing) return;
  closing = true; closeSettings();
  let collapsed = false;
  try {
    const animation = animatePanel('close');
    if (animation) await animation.finished.catch(() => {});
    collapsed = Boolean((await window.shangyi.resize(true))?.settings?.compact);
  } finally {
    closing = false;
    // If the window did not shrink, show the panel again rather than leaving it faded out.
    if (!collapsed) { panelAnimation?.cancel(); panelAnimation = null; }
  }
}
function toggleDetails() {
  if (!current) return;
  if (current.settings.compact) { closeSettings(); window.shangyi.resize(false); } else closeDetails();
}
mascotWrap.addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const tapped = !drag.moved && Math.hypot(event.screenX - drag.x, event.screenY - drag.y) < 6;
  const dropped = drag.moved;
  drag = null;
  if (tapped) toggleDetails();
  else if (dropped && !current?.settings.compact) window.shangyi.settle();
});
for (const type of ['lostpointercapture', 'pointercancel']) mascotWrap.addEventListener(type, event => { if (drag?.pointerId === event.pointerId) drag = null; });
mascotWrap.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleDetails(); } });
mascotWrap.addEventListener('contextmenu', event => { event.preventDefault(); window.shangyi.showMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !current.settings.compact) closeDetails(); });
let passThrough = false;
document.addEventListener('mousemove', event => {
  const next = !drag && !event.target.closest('button, #panel, #compact-panel, #mascot-wrap');
  if (next !== passThrough) { passThrough = next; window.shangyi.passThrough(next); }
});
setInterval(() => {
  if (!current) return;
  for (const label of document.querySelectorAll('.reset-countdown')) label.textContent = resetText({ resetsAt: Number(label.dataset.resetsAt) || null });
  updateFooter();
  const staleTransition = current.providers.some(p => p.displayStatus === 'live' && statusFor(p) === 'stale');
  if (staleTransition) { current.providers.forEach(p => p.displayStatus = statusFor(p)); renderProviders(); reaction('Confused'); }
}, 1000);
window.shangyi.onState(render);
window.shangyi.onOpenSettings(openSettings);
window.shangyi.onCollapse(closeDetails);
window.shangyi.onNotice(toast);
window.shangyi.getState().then(render);
