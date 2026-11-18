// Group 3 end-to-end checks: settings page and popup preference (S1-S6).
// Run: npm run test:e2e
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Builder } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

const EXT_DIR = process.env.EXT_DIR ?? new URL("../../", import.meta.url).pathname;
const FIREFOX = process.env.FIREFOX_BIN ?? "/Applications/Firefox.localized/Firefox.app/Contents/MacOS/firefox";
const UUID = "22222222-3333-4444-5555-666666666666";
const EXT = `moz-extension://${UUID}`;
const PORT = 8775;
const A = `http://localhost:${PORT}/`;
const B = `http://127.0.0.1:${PORT}/`;
const SETTINGS = `${EXT}/src/settings/index.html`;
const POPUP = `${EXT}/src/popup/popup.html`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server, driver, extHandle;

before(async () => {
  server = http
    .createServer((_, res) => {
      res.setHeader("content-type", "text/html");
      res.end(`<meta name=color-scheme content="light dark"><title>p</title><h1>page</h1>`);
    })
    .listen(PORT);
  const opts = new firefox.Options()
    .setBinary(FIREFOX)
    .setPreference("extensions.webextensions.uuids", JSON.stringify({ "tab-color-scheme@vrtexe": UUID }))
    .setPreference("svg.context-properties.content.enabled", true)
    .setPreference("ui.systemUsesDarkTheme", 0)
    .setPreference("dom.allow_scripts_to_close_windows", true)
    .addArguments("-headless");
  driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(opts)
    .setFirefoxService(new firefox.ServiceBuilder().setPort(4775).addArguments("--allow-system-access"))
    .build();
  await driver.installAddon(EXT_DIR, true);
  await sleep(1500);
  extHandle = await openExt(SETTINGS);
});

after(async () => {
  await driver?.quit();
  server?.close();
});

const chrome = async (fn, ...args) => {
  await driver.setContext(firefox.Context.CHROME);
  try {
    return await driver.executeScript(fn, ...args);
  } finally {
    await driver.setContext(firefox.Context.CONTENT);
  }
};

const handles = () => driver.getAllWindowHandles();

// open an extension page in a tab of the current window; select=false keeps the current tab active
async function openExt(url, { select = true } = {}) {
  const before = await handles();
  await chrome(
    `const t = gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
     if (arguments[1]) gBrowser.selectedTab = t;`,
    url,
    select,
  );
  await sleep(800);
  const h = (await handles()).find((x) => !before.includes(x));
  return h;
}

// open an extension page in a new browser window; returns its handle
async function openExtInNewWindow(url) {
  const before = await handles();
  await driver.switchTo().newWindow("window");
  await chrome(
    `gBrowser.loadURI(Services.io.newURI(arguments[0]), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`,
    url,
  );
  await sleep(1000);
  return (await handles()).find((x) => !before.includes(x));
}

const ext = (fn, ...args) =>
  driver.executeAsyncScript(
    `const done = arguments[arguments.length - 1];
     (${fn}).apply(null, Array.from(arguments).slice(0, -1)).then(v => done({ v }), e => done({ e: String(e) }));`,
    ...args,
  );

const setSystemTheme = async (dark) => {
  await chrome(`Services.prefs.setIntPref("ui.systemUsesDarkTheme", arguments[0]);`, dark ? 1 : 0);
  await sleep(500);
};

async function reset(system = "light") {
  for (const h of await handles()) {
    if (h !== extHandle) {
      await driver.switchTo().window(h);
      await driver.close();
    }
  }
  await driver.switchTo().window(extHandle);
  await setSystemTheme(system === "dark");
  const r = await ext(async () => {
    await browser.storage.local.clear();
    await browser.browserSettings.overrideContentColorScheme.clear({});
    return true;
  });
  assert.equal(r.e, undefined, r.e);
  await sleep(300);
}

const pageScheme = () =>
  driver.executeScript(`return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"`);

async function openPage(url, { newWindow = false } = {}) {
  await driver.switchTo().newWindow(newWindow ? "window" : "tab");
  await driver.get(url);
  await driver.executeScript("window.__marker = 'alive'");
  await sleep(500);
  return driver.getWindowHandle();
}

async function readSettings(h) {
  await driver.switchTo().window(h);
  return driver.executeScript(`return {
    radio: document.querySelector('input[name=globalTheme]:checked')?.value ?? null,
    checkbox: document.getElementById('closePopupOnSelect').checked,
  }`);
}

async function clickRadio(value) {
  const el = await driver.findElement({ css: `input[name=globalTheme][value=${value}]` });
  const label = await driver.executeScript(`return arguments[0].closest('label')`, el);
  await label.click();
}

async function clickCheckbox() {
  const el = await driver.findElement({ css: "#closePopupOnSelect" });
  const label = await driver.executeScript(`return arguments[0].closest('label')`, el);
  await label.click();
}


// set the preference through the settings page UI; leaves the page open in `extHandle`
async function setPreference(checked) {
  const h = await openExt(SETTINGS);
  await driver.switchTo().window(h);
  await sleep(500);
  const cur = (await readSettings(h)).checkbox;
  if (cur !== checked) await clickCheckbox();
  await sleep(300);
  await driver.close();
  await driver.switchTo().window(extHandle);
}

// popup for the host of the currently active page tab (pageHandle), not selected
async function openPopup(pageHandle) {
  await driver.switchTo().window(pageHandle);
  const h = await openExt(POPUP, { select: false });
  await driver.switchTo().window(h);
  await sleep(300);
  return h;
}

const popupState = () =>
  driver.executeScript(`return [...document.querySelectorAll('.panel-list-item')].map(i => ({
    scheme: i.dataset.scheme, selected: i.classList.contains('selected'),
    aria: i.getAttribute('aria-pressed'), badge: !!i.querySelector('.panel-list-item-badge.active') }))`);

const sel = (checked) => (checked ? "checked" : "unchecked");

// ---- S1
for (const [id, control, expected] of [
  ["S1-1", "checked globalTheme radio", "auto"],
  ["S1-2", "Close popup on select checkbox", "unchecked"],
]) {
  test(`${id} settings page opens on the current state: ${control} is ${expected}`, async () => {
    await reset();
    const h = await openExt(SETTINGS);
    await driver.switchTo().window(h);
    await sleep(700);
    const s = await readSettings(h);
    assert.equal(id === "S1-1" ? s.radio : sel(s.checkbox), expected);
  });
}

// ---- S2
for (const [id, system, choice, expectedPage] of [
  ["S2-1", "light", "Dark", "dark"],
  ["S2-2", "dark", "Light", "light"],
  ["S2-3", "dark", "Automatic", "dark"],
  ["S2-4", "light", "Automatic", "light"],
]) {
  test(`${id} choosing ${choice} with system ${system} applies ${expectedPage} to host B`, async () => {
    await reset(system);
    const pageB = await openPage(B);
    assert.equal(await pageScheme(), system, "precondition: host B follows the system");
    // settings page in its own window so host B's tab stays the active tab of its window
    const settings = await openExtInNewWindow(SETTINGS);
    await driver.switchTo().window(settings);
    await sleep(700);
    await clickRadio({ Dark: "dark", Light: "light", Automatic: "auto" }[choice]);
    await sleep(1000);
    await driver.switchTo().window(pageB);
    await sleep(500);
    assert.equal(await pageScheme(), expectedPage, "page on host B");
    assert.equal(await driver.executeScript("return window.__marker"), "alive", "page was not reloaded");
    const reopened = await openExt(SETTINGS);
    const s = await readSettings(reopened);
    assert.equal(s.radio, { Dark: "dark", Light: "light", Automatic: "auto" }[choice], "settings reopened");
  });
}

// ---- S3
for (const [id, value] of [
  ["S3-1", "dark"],
  ["S3-2", "light"],
]) {
  test(`${id} first settings page follows override set from second page to ${value}`, async () => {
    await reset();
    const first = await openExtInNewWindow(SETTINGS);
    await driver.switchTo().window(first);
    await sleep(700);
    assert.equal((await readSettings(first)).radio, "auto", "precondition");
    const second = await openExtInNewWindow(SETTINGS);
    await driver.switchTo().window(second);
    await sleep(700);
    await clickRadio(value);
    const t0 = Date.now();
    let seen = null;
    while (Date.now() - t0 < 4000) {
      // reading first page's DOM does not activate anything: it is the selected tab of its own window
      const s = await readSettings(first);
      if (s.radio === value) {
        seen = Date.now() - t0;
        break;
      }
      await sleep(100);
    }
    assert.ok(seen !== null && seen <= 2000, `first page showed ${value} after ${seen} ms (limit 2000)`);
  });
}

// ---- S4
for (const [id, before, after] of [
  ["S4-1", false, true],
  ["S4-2", true, false],
]) {
  test(`${id} popup preference persists: ${sel(before)} -> ${sel(after)}`, async () => {
    await reset();
    if (before) await setPreference(true);
    let h = await openExt(SETTINGS);
    await driver.switchTo().window(h);
    await sleep(700);
    assert.equal((await readSettings(h)).checkbox, before, "precondition");
    await clickCheckbox();
    await sleep(300);
    await driver.close();
    h = await openExt(SETTINGS);
    assert.equal((await readSettings(h)).checkbox, after);
  });
}

// ---- S5
for (const [id, pref, closed] of [
  ["S5-1", true, true],
  ["S5-2", false, false],
]) {
  test(`${id} popup ${closed ? "closes" : "stays open"} after picking Dark with preference ${sel(pref)}`, async () => {
    await reset("light");
    await setPreference(pref);
    const pageA = await openPage(A);
    assert.equal(await pageScheme(), "light", "precondition");
    const popup = await openPopup(pageA);
    await driver.findElement({ css: ".panel-list-item[data-scheme=dark]" }).click();
    await sleep(1000);
    const alive = (await handles()).includes(popup);
    if (!closed) {
      const st = await popupState();
      const dark = st.find((i) => i.scheme === "dark");
      assert.deepEqual([dark.selected, dark.aria, dark.badge], [true, "true", true], "Dark selected in open popup");
    }
    assert.equal(alive, !closed, closed ? "popup should be closed" : "popup should stay open");
    await driver.switchTo().window(pageA);
    await sleep(1000);
    assert.equal(await pageScheme(), "dark", "page on host A");
  });
}

// ---- S6
test("S6-1 popup footer Settings opens the extension settings and closes the popup", async () => {
  await reset("light");
  const pageA = await openPage(A);
  const popup = await openPopup(pageA);
  const label = await driver.executeScript(`return document.getElementById('manage-settings').textContent.trim()`);
  assert.match(label, /Settings/);
  await driver.findElement({ css: "#manage-settings" }).click();
  await sleep(1500);
  const hs = await handles();
  assert.ok(!hs.includes(popup), "popup tab should no longer exist");
  const selected = await chrome(
    `return { url: gBrowser.selectedBrowser.currentURI.spec, all: gBrowser.tabs.map(t => t.linkedBrowser.currentURI.spec) }`,
  );
  const ok = selected.url === "about:addons" || selected.url.startsWith(SETTINGS);
  assert.ok(ok, `selected tab is ${selected.url}; tabs ${JSON.stringify(selected.all)}`);
});

// ---- extras
test("extra S2-3x Automatic after Dark clears the global override (system dark)", async () => {
  await reset("dark");
  const pageB = await openPage(B);
  const settings = await openExtInNewWindow(SETTINGS);
  await driver.switchTo().window(settings);
  await sleep(700);
  await clickRadio("light");
  await sleep(1000);
  await driver.switchTo().window(pageB);
  assert.equal(await pageScheme(), "light");
  await driver.switchTo().window(settings);
  await clickRadio("auto");
  await sleep(1000);
  await driver.switchTo().window(pageB);
  assert.equal(await pageScheme(), "dark");
});

test("extra S2-5x global Dark survives activating host B tab again (Q1)", async () => {
  await reset("light");
  const pageB = await openPage(B);
  const settings = await openExt(SETTINGS);
  await driver.switchTo().window(settings);
  await sleep(700);
  await clickRadio("dark");
  await sleep(1000);
  await driver.switchTo().window(pageB);
  await sleep(1000);
  assert.equal(await pageScheme(), "dark", "global Dark should still apply after reactivating host B");
});

test("extra S2-6x settings radio keeps the global default after a per-site pick in the popup (Q2)", async () => {
  await reset("light");
  const pageA = await openPage(A);
  const settings = await openExtInNewWindow(SETTINGS);
  const popup = await openPopup(pageA);
  await driver.findElement({ css: ".panel-list-item[data-scheme=dark]" }).click();
  await sleep(2500);
  const s = await readSettings(settings);
  assert.equal(s.radio, "auto", "settings page radio after popup pick");
});
