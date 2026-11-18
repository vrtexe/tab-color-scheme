import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.browser = {
  storage: {
    local: {
      get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => store.has(k)).map((k) => [k, store.get(k)])),
      set: async (obj) => { for (const [k, v] of Object.entries(obj)) store.set(k, v); },
      remove: async (keys) => { for (const k of [].concat(keys)) store.delete(k); },
    },
  },
};

const shared = await import('../src/shared.js');
const { ColorScheme, ColorSchemeIcon, colorSchemeValueOf, extractTabHost,
  colorSchemeStorageManager, colorSchemeKeyOf, storageManager } = shared;
const ColorSchemeValues = Object.values(ColorScheme);

// U1
for (const [id, input, expected] of [
  ['U1-1', 'dark', 'dark'], ['U1-2', 'light', 'light'], ['U1-3', 'auto', 'auto'],
  ['U1-4', 'none', undefined], ['U1-5', 'system', undefined], ['U1-6', 'purple', undefined],
  ['U1-7', 'toString', undefined], ['U1-8', '__proto__', undefined], ['U1-9', '', undefined],
]) {
  test(`${id} parse "${input}"`, () => assert.ok(colorSchemeValueOf(input) === expected));
}

// U2
test('U2-1 sorted ColorSchemeValues', () => assert.equal([...ColorSchemeValues].sort().join(','), 'auto,dark,light'));
test('U2-2 ColorScheme is frozen', () => assert.equal(Object.isFrozen(ColorScheme), true));
test('U2-4 keys of ColorSchemeIcon sorted', () => assert.equal(Object.keys(ColorSchemeIcon).sort().join(','), 'auto,dark,light'));

// U3
for (const [id, tab, expected] of [
  ['U3-1', { url: 'https://example.com/a?b=1#c' }, 'example.com'],
  ['U3-2', { url: 'http://localhost:8765/' }, 'localhost:8765'],
  ['U3-3', { url: 'http://127.0.0.1:8765/x' }, '127.0.0.1:8765'],
  ['U3-4', { url: 'https://EXAMPLE.com/' }, 'example.com'],
  ['U3-5', { url: 'https://user:pw@example.com:443/' }, 'example.com'],
  ['U3-6', { url: 'about:blank' }, null],
  ['U3-7', { url: 'about:addons' }, null],
  ['U3-8', { url: 'file:///tmp/page.html' }, null],
  ['U3-9', { url: 'not a url' }, null],
  ['U3-10', {}, null],
  ['U3-11', undefined, null],
]) {
  test(`${id} extractTabHost ${JSON.stringify(tab)}`, () => assert.ok(extractTabHost(tab) === expected));
}

// U4
test('U4-1 manager for example.com', () => {
  const m = colorSchemeStorageManager('example.com');
  for (const f of ['get', 'set', 'remove']) assert.equal(typeof m[f], 'function');
});
for (const [id, host] of [['U4-2', ''], ['U4-3', null], ['U4-4', undefined]]) {
  test(`${id} manager for ${JSON.stringify(host)} throws`, () => assert.throws(() => colorSchemeStorageManager(host), Error));
}

// U5
test('U5-1 key of example.com', () => assert.equal(colorSchemeKeyOf('example.com'), 'settings:example.com:color-scheme'));
test('U5-2 key of localhost:8765', () => assert.equal(colorSchemeKeyOf('localhost:8765'), 'settings:localhost:8765:color-scheme'));
test('U5-3 set dark, get example.com', async () => {
  store.clear();
  await colorSchemeStorageManager('example.com').set('dark');
  assert.equal(await colorSchemeStorageManager('example.com').get(), 'dark');
});
test('U5-4 set dark for example.com, get other.com', async () => {
  store.clear();
  await colorSchemeStorageManager('example.com').set('dark');
  assert.ok((await colorSchemeStorageManager('other.com').get()) === undefined);
});
test('U5-5 set then remove', async () => {
  store.clear();
  const m = colorSchemeStorageManager('example.com');
  await m.set('dark');
  await m.remove();
  assert.ok((await m.get()) === undefined);
});
test('U5-6 set dark then light', async () => {
  store.clear();
  const m = colorSchemeStorageManager('example.com');
  await m.set('dark');
  await m.set('light');
  assert.equal(await m.get(), 'light');
});
test('U5-7 closePopupOnSelect round trip', async () => {
  store.clear();
  const m = storageManager('closePopupOnSelect');
  await m.set('true');
  assert.equal(await storageManager('closePopupOnSelect').get(), 'true');
});

// extra probes
test('extra-1 Dark / DARK are accepted (Q5)', () => {
  assert.equal(colorSchemeValueOf('Dark'), 'dark');
  assert.equal(colorSchemeValueOf('DARK'), 'dark');
});
test('extra-2 null and undefined parse to undefined', () => {
  assert.ok(colorSchemeValueOf(null) === undefined);
  assert.ok(colorSchemeValueOf(undefined) === undefined);
});
test('extra-3 prototype names parse to undefined', () => {
  for (const n of ['constructor', 'hasownproperty', 'valueOf', 'Dark,Light', 'Dark', ' dark'.trim() + ' ']) {
    const r = colorSchemeValueOf(n);
    assert.ok(r === undefined || ColorSchemeValues.includes(r), `${n} -> ${r}`);
  }
  assert.ok(colorSchemeValueOf('constructor') === undefined);
  assert.ok(colorSchemeValueOf('valueOf') === undefined);
});
test('extra-4 www. prefix is stripped (Q3)', () => assert.equal(extractTabHost({ url: 'https://www.example.com/' }), 'example.com'));
test('extra-5 different ports are different hosts (Q4)', () => {
  assert.notEqual(extractTabHost({ url: 'http://localhost:8765/' }), extractTabHost({ url: 'http://localhost:8766/' }));
});
test('extra-7 E8: URLs without a site host (data:, javascript:, view-source:, moz-extension:, chrome:, resource:) give null', () => {
  for (const u of ['data:text/html,hi', 'javascript:void 0', 'moz-extension://abc/src/popup/popup.html', 'view-source:https://example.com/', 'chrome://browser/content/x', 'resource://x/y'])
    assert.ok(extractTabHost({ url: u }) === null, u);
});
test('extra-8 get on missing key resolves undefined; remove of missing key does not throw', async () => {
  store.clear();
  const m = colorSchemeStorageManager('nothing.test');
  assert.ok((await m.get()) === undefined);
  await m.remove();
});
test('extra-9 a host that is empty after stripping www. gives null', () => assert.ok(extractTabHost({ url: 'http://www./' }) === null));
