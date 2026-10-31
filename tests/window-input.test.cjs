const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const appDir = path.resolve(__dirname, '../app');

function renderer() {
  const elements = new Map(), sizes = [], moves = [], settles = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, handlers: {},
      addEventListener(type, callback) { this.handlers[type] = callback; }, setPointerCapture() {} });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: element, addEventListener() {} },
    window: { ShanGyiI18n: require('../app/renderer/i18n.js'), addEventListener() {}, shangyi: {
      resize: compact => sizes.push(compact), move: delta => moves.push(delta), settle: () => settles.push(true),
      onState() {}, onOpenSettings() {}, onCollapse() {}, onNotice() {}, getState: () => ({ then() {} })
    } }, setInterval() {}, setTimeout() {}, clearTimeout() {}
  });
  vm.runInContext(fs.readFileSync(path.join(appDir, 'renderer/renderer.js'), 'utf8'), context);
  vm.runInContext("current = { settings: { compact: true, locale: 'en' } }", context);
  const fire = (type, overrides = {}) => element('mascot-wrap').handlers[type]({
    pointerId: 1, button: 0, screenX: 100, screenY: 100, ...overrides
  });
  return { context, sizes, moves, settles, fire };
}

test('a mascot tap opens details and another tap closes them', () => {
  const view = renderer();
  view.fire('pointerdown'); view.fire('pointerup');
  assert.deepEqual(view.sizes, [false]);
  vm.runInContext('current.settings.compact = false', view.context);
  view.fire('pointerdown'); view.fire('pointerup');
  assert.deepEqual(view.sizes, [false, true]);
});

test('small hand movement during a click does not turn it into a drag', () => {
  const view = renderer();
  view.fire('pointerdown');
  view.fire('pointermove', { screenX: 103, screenY: 102 });
  view.fire('pointerup', { screenX: 103, screenY: 102 });
  assert.deepEqual(view.sizes, [false]);
  assert.equal(view.moves.length, 0);
});

test('dragging moves the pet without opening the panel, including a return to the start', () => {
  const view = renderer();
  view.fire('pointerdown');
  view.fire('pointermove', { screenX: 122, screenY: 116 });
  view.fire('pointermove', { screenX: 100, screenY: 100 });
  view.fire('pointerup');
  assert.equal(view.moves.length, 2);
  assert.deepEqual(view.sizes, []);
});

test('cancelled gestures and another pointer cannot open details', () => {
  const view = renderer();
  view.fire('pointerdown');
  view.fire('pointerup', { pointerId: 2 });
  assert.deepEqual(view.sizes, []);
  view.fire('pointercancel'); view.fire('pointerup');
  view.fire('pointerdown'); view.fire('lostpointercapture'); view.fire('pointerup');
  assert.deepEqual(view.sizes, []);
  view.fire('pointerdown'); view.fire('pointerup');
  assert.deepEqual(view.sizes, [false]);
});

test('dropping the mascot with details open asks for the panel to settle, a closed panel does not', () => {
  const view = renderer();
  view.fire('pointerdown'); view.fire('pointermove', { screenX: 140, screenY: 100 }); view.fire('pointerup', { screenX: 140, screenY: 100 });
  assert.equal(view.settles.length, 0);
  vm.runInContext('current.settings.compact = false', view.context);
  view.fire('pointerdown'); view.fire('pointermove', { screenX: 140, screenY: 100 }); view.fire('pointerup', { screenX: 140, screenY: 100 });
  assert.equal(view.settles.length, 1);
  assert.deepEqual(view.sizes, []);
});

function mainWindow(save, { start = { x: 1000, y: 800 }, workArea = { x: 0, y: 0, width: 1920, height: 1080 } } = {}) {
  const handlers = new Map(), events = new Map(), sent = [], ignored = [];
  let bounds = { ...start, width: 210, height: 216 };
  const fakeWindow = {
    webContents: { send: (channel, state) => sent.push({ channel, state }) },
    isDestroyed: () => false, isVisible: () => true,
    getPosition: () => [bounds.x, bounds.y], getSize: () => [bounds.width, bounds.height],
    getBounds: () => ({ ...bounds }), setResizable() {},
    setPosition: (x, y) => { bounds.x = x; bounds.y = y; },
    setBounds: next => { bounds = { ...next }; },
    setIgnoreMouseEvents: value => ignored.push(value)
  };
  const electron = {
    app: { setName() {}, setAppUserModelId() {}, on() {}, getPath: () => '/test-profile',
      getVersion: () => 'test', whenReady: () => ({ then() {} }) },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler), on: (name, handler) => events.set(name, handler) },
    screen: { getDisplayMatching: () => ({ workArea }) }
  };
  const realRequire = createRequire(path.join(appDir, 'main.cjs'));
  const context = vm.createContext({
    require: name => name === 'electron' ? electron : name === 'node:fs' ? { existsSync: () => false }
      : name === 'node:fs/promises' ? { mkdir: async () => {}, writeFile: save } : realRequire(name),
    process: { platform: 'win32', argv: ['node', 'main.cjs', '--test'], env: {} },
    console, __dirname: appDir, testWindow: fakeWindow
  });
  vm.runInContext(fs.readFileSync(path.join(appDir, 'main.cjs'), 'utf8'), context);
  vm.runInContext('win = testWindow; ipc();', context);
  const layout = () => sent.filter(message => message.channel === 'state:update').at(-1).state.layout;
  // Where the mascot is on screen: window position plus its place inside the window.
  const mascot = () => ({ x: bounds.x + layout().mascot.x, y: bounds.y + layout().mascot.y });
  const panel = () => ({ ...layout().panel, x: bounds.x + layout().panel.x, y: bounds.y + layout().panel.y });
  return { handlers, events, sent, ignored, getBounds: () => bounds, layout, mascot, panel, workArea };
}
const inside = (box, area) => box.x >= area.x && box.y >= area.y && box.x + box.width <= area.x + area.width && box.y + box.height <= area.y + area.height;

test('the compact mascot accepts a quick click even after a stale click-through request', async () => {
  const view = mainWindow(async () => {});
  view.events.get('window:passthrough')(null, true);
  assert.equal(view.ignored.at(-1), false);
  await view.handlers.get('window:compact')(null, false);
  assert.equal(view.getBounds().width, 430);
  view.events.get('window:passthrough')(null, true);
  assert.equal(view.ignored.at(-1), true);
  await view.handlers.get('window:compact')(null, true);
  assert.equal(view.ignored.at(-1), false);
  view.events.get('window:passthrough')(null, true);
  assert.equal(view.ignored.at(-1), false);
});

test('details render before preferences finish saving and remain usable if the save fails', async () => {
  let failSave;
  const pendingSave = new Promise((resolve, reject) => { failSave = reject; });
  const view = mainWindow(() => pendingSave);
  const open = view.handlers.get('window:compact')(null, false);
  const update = view.sent.find(message => message.channel === 'state:update').state;
  assert.equal(update.settings.compact, false);
  assert.equal(update.layout.compact, false);
  assert.deepEqual(view.getBounds(), update.layout.bounds);
  failSave(new Error('Disk full'));
  assert.equal((await open).settings.compact, false);
  assert.equal(view.sent.at(-1).channel, 'ui:notice');
  assert.match(view.sent.at(-1).state, /could not be saved/);
});

test('with room above, the panel opens above the mascot and the mascot does not move', async () => {
  const view = mainWindow(async () => {});
  const before = { x: 1018, y: 831 };
  await view.handlers.get('window:compact')(null, false);
  assert.equal(view.layout().placement, 'above');
  assert.deepEqual(view.mascot(), before);
  assert.ok(view.panel().y + view.panel().height <= before.y, 'panel is above the mascot');
  assert.ok(inside(view.panel(), view.workArea));
  await view.handlers.get('window:compact')(null, true);
  assert.deepEqual(view.mascot(), before);
  assert.deepEqual(view.getBounds(), { x: 1000, y: 800, width: 210, height: 216 });
});

test('near the top of the screen the panel opens below instead of pushing the mascot down', async () => {
  const view = mainWindow(async () => {}, { start: { x: 600, y: 0 } });
  await view.handlers.get('window:compact')(null, false);
  assert.equal(view.layout().placement, 'below');
  assert.deepEqual(view.mascot(), { x: 618, y: 31 });
  assert.ok(view.panel().y >= 31 + 174, 'panel is below the mascot');
  assert.ok(inside(view.panel(), view.workArea));
  await view.handlers.get('window:compact')(null, true);
  assert.deepEqual(view.getBounds(), { x: 600, y: 0, width: 210, height: 216 });
});

test('without room above or below, the panel opens beside the mascot', async () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 700 };
  const right = mainWindow(async () => {}, { start: { x: 300, y: 240 }, workArea });
  await right.handlers.get('window:compact')(null, false);
  assert.equal(right.layout().placement, 'right');
  assert.deepEqual(right.mascot(), { x: 318, y: 271 });
  assert.ok(right.panel().x >= 318 + 174 && inside(right.panel(), workArea));
  const left = mainWindow(async () => {}, { start: { x: 1700, y: 240 }, workArea });
  await left.handlers.get('window:compact')(null, false);
  assert.equal(left.layout().placement, 'left');
  assert.deepEqual(left.mascot(), { x: 1718, y: 271 });
  assert.ok(left.panel().x + left.panel().width <= 1718 && inside(left.panel(), workArea));
});

test('on a laptop-height screen the panel stays above, shorter, instead of jumping to the side', async () => {
  // A 1440×900 Mac: menu bar 25, Dock ~78, so ~797 of work area; mascot in its default corner.
  const workArea = { x: 0, y: 25, width: 1440, height: 797 };
  const view = mainWindow(async () => {}, { start: { x: 1110, y: 566 }, workArea });
  await view.handlers.get('window:compact')(null, false);
  assert.equal(view.layout().placement, 'above');
  assert.deepEqual(view.mascot(), { x: 1128, y: 597 });
  assert.ok(view.panel().height >= 420 && view.panel().height < 590, `panel height ${view.panel().height}`);
  assert.ok(view.panel().y + view.panel().height <= 597, 'panel is above the mascot');
  assert.ok(inside(view.panel(), workArea));
  // Near the top of the same screen it goes below, also shorter.
  const top = mainWindow(async () => {}, { start: { x: 600, y: 30 }, workArea });
  await top.handlers.get('window:compact')(null, false);
  assert.equal(top.layout().placement, 'below');
  assert.ok(inside(top.panel(), workArea));
});

test('a dropped mascot keeps its panel side while it fits and flips when it does not', async () => {
  const view = mainWindow(async () => {});
  await view.handlers.get('window:compact')(null, false);
  view.events.get('window:move')(null, { x: 0, y: -100 });
  await view.handlers.get('window:settle')();
  assert.equal(view.layout().placement, 'above');
  assert.deepEqual(view.mascot(), { x: 1018, y: 731 });
  view.events.get('window:move')(null, { x: 0, y: -500 });
  view.events.get('window:move')(null, { x: 0, y: -100 });
  const dropped = view.mascot();
  await view.handlers.get('window:settle')();
  assert.equal(view.layout().placement, 'below');
  assert.deepEqual(view.mascot(), dropped);
  assert.ok(inside(view.panel(), view.workArea));
});

test('the layout keeps a partly off-screen mascot where it is and shrinks the panel on a tiny display', () => {
  const { layoutFor } = require('../app/window-layout.cjs');
  const offscreen = layoutFor({ compact: false, mascot: { x: -60, y: 600 }, workArea: { x: 0, y: 0, width: 1280, height: 1000 } });
  assert.equal(offscreen.bounds.x + offscreen.mascot.x, -60);
  assert.equal(offscreen.bounds.y + offscreen.mascot.y, 600);
  const tiny = layoutFor({ compact: false, mascot: { x: 200, y: 200 }, workArea: { x: 0, y: 0, width: 600, height: 560 } });
  assert.equal(tiny.bounds.x + tiny.mascot.x, 200);
  assert.ok(tiny.panel.height >= 300 && tiny.panel.height < 590);
  const panel = { x: tiny.bounds.x + tiny.panel.x, y: tiny.bounds.y + tiny.panel.y, width: tiny.panel.width, height: tiny.panel.height };
  assert.ok(inside(panel, { x: 0, y: 0, width: 600, height: 560 }));
});
