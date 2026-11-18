// G2 end to end, popup and per-site memory. Run: npm run test:e2e
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Builder } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

const EXT_DIR = process.env.EXT_DIR ?? new URL("../../", import.meta.url).pathname;
const FIREFOX = process.env.FIREFOX_BIN ?? "/Applications/Firefox.localized/Firefox.app/Contents/MacOS/firefox";
const UUID = "11111111-2222-3333-4444-555555555555";
const EXT = `moz-extension://${UUID}`;
const PORT = 8765;
const GECKO_PORT = 4465;
const HOST_A = `localhost:${PORT}`;
const HOST_B = `127.0.0.1:${PORT}`;
const URL_A = `http://${HOST_A}/`;
const URL_B = `http://${HOST_B}/`;
const keyOf = (host) => `settings:${host}:color-scheme`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let driver, server, extH, created = [];

const ext = async (fn, ...args) => {
  await driver.switchTo().window(extH);
  const r = await driver.executeAsyncScript(
    `const done = arguments[arguments.length - 1];
     (${fn}).apply(null, Array.from(arguments).slice(0, -1)).then(v => done({ v }), e => done({ e: String(e) }));`,
    ...args,
  );
  if (r.e) throw new Error(r.e);
  return r.v;
};
const chrome = async (script, ...args) => {
  await driver.setContext(firefox.Context.CHROME);
  try { return await driver.executeScript(script, ...args); } finally { await driver.setContext(firefox.Context.CONTENT); }
};
const pageScheme = async (h) => {
  await driver.switchTo().window(h);
  return driver.executeScript(`return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"`);
};
const waitScheme = async (h, expected, ms = 3500) => {
  const end = Date.now() + ms;
  let s;
  do { s = await pageScheme(h); if (s === expected) return s; await sleep(150); } while (Date.now() < end);
  return s;
};
const setSystem = (dark) => chrome(`Services.prefs.setIntPref("ui.systemUsesDarkTheme", arguments[0])`, dark ? 1 : 0);
const openTab = async (url) => {
  await driver.switchTo().newWindow("tab");
  if (url) await driver.get(url);
  const h = await driver.getWindowHandle();
  created.push(h);
  await sleep(700);
  return h;
};
const seed = (map) => ext(async (m) => browser.storage.local.set(m), Object.fromEntries(Object.entries(map).map(([h, v]) => [keyOf(h), v])));
const storedSchemes = () => ext(async () => {
  const all = await browser.storage.local.get(null);
  return Object.fromEntries(Object.entries(all).filter(([k]) => /^settings:.*:color-scheme$/.test(k)));
});
const overrideValue = () => ext(async () => (await browser.browserSettings.overrideContentColorScheme.get({})).value);

// Opens the real toolbar popup over the tab whose url starts with `prefix` (or equals it with exact), optionally clicks `label`.
const popupSession = (prefix, label, exact = false) =>
  ext(async (prefix, label, exact) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = (await browser.tabs.query({})).filter((t) => (exact ? t.url === prefix : t.url.startsWith(prefix))).sort((a, b) => b.id - a.id)[0];
    if (!t) throw new Error("no tab " + prefix);
    await browser.tabs.update(t.id, { active: true });
    await sleep(600);
    await browser.action.openPopup();
    let w;
    for (let i = 0; i < 30; i++) {
      [w] = browser.extension.getViews({ type: "popup" });
      if (w && w.document.querySelector(".panel-list-item.selected, .panel-list-item:disabled")) break;
      await sleep(100);
    }
    if (!w) throw new Error("popup did not open");
    const read = () => [...w.document.querySelectorAll(".panel-list-item[data-scheme]")].map((i) => ({
      label: i.querySelector(".panel-list-item-label").textContent.trim(),
      description: i.querySelector(".panel-list-item-description").textContent.trim(),
      selected: i.classList.contains("selected") && i.getAttribute("aria-pressed") === "true",
    }));
    const before = read();
    let after = null;
    if (label) {
      [...w.document.querySelectorAll(".panel-list-item[data-scheme]")].find((i) => i.querySelector(".panel-list-item-label").textContent.trim() === label).click();
      await sleep(1200);
      after = read();
    }
    const title = await browser.action.getTitle({});
    const stored = await browser.storage.local.get(null);
    const override = (await browser.browserSettings.overrideContentColorScheme.get({})).value;
    try { w.close(); } catch {}
    return { tabUrl: t.url, before, after, title, stored, override };
  }, prefix, label ?? null, exact);

const openExtPage = async () => {
  await chrome(`gBrowser.selectedTab = gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`, `${EXT}/src/popup/popup.html`);
  await sleep(900);
  const hs = await driver.getAllWindowHandles();
  extH = hs[hs.length - 1];
  await driver.switchTo().window(extH);
};

const reset = async () => {
  for (const h of created.splice(0)) {
    try { await driver.switchTo().window(h); await driver.close(); } catch {}
  }
  await ext(async () => {
    await browser.storage.local.clear();
    await browser.browserSettings.overrideContentColorScheme.clear({});
    await new Promise((r) => setTimeout(r, 400));
    await browser.action.setTitle({ title: null });
  });
  await setSystem(false);
  await sleep(400);
};

before(async () => {
  server = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(`<meta name=color-scheme content="light dark"><title>${req.url}</title><h1>page ${req.headers.host}${req.url}</h1>`);
  }).listen(PORT);
  const opts = new firefox.Options()
    .setBinary(FIREFOX)
    .setPreference("extensions.webextensions.uuids", JSON.stringify({ "tab-color-scheme@vrtexe": UUID }))
    .setPreference("extensions.openPopupWithoutUserGesture.enabled", true)
    .setPreference("svg.context-properties.content.enabled", true)
    .setPreference("ui.systemUsesDarkTheme", 0)
    .addArguments("-headless");
  const service = new firefox.ServiceBuilder().addArguments("--allow-system-access").setPort(GECKO_PORT);
  driver = await new Builder().forBrowser("firefox").setFirefoxOptions(opts).setFirefoxService(service).build();
  await driver.installAddon(EXT_DIR, true);
  await sleep(1500);
  await openExtPage();
});
after(async () => {
  await driver?.quit();
  server?.close();
});
beforeEach(reset);

// P1
for (const [id, label, description, selected] of [
  ["P1-1", "Auto", "Use the default from settings", true],
  ["P1-2", "Light", "Force light color scheme", false],
  ["P1-3", "Dark", "Force dark color scheme", false],
]) {
  test(`${id} popup lists ${label} with its description, selected=${selected}, for an unknown site`, async () => {
    await openTab(URL_A);
    const s = await popupSession(URL_A);
    const item = s.before.find((i) => i.label === label);
    assert.ok(item, `item ${label} missing: ${JSON.stringify(s.before)}`);
    assert.equal(item.description, description);
    assert.equal(item.selected, selected);
    assert.equal(s.before.length, 3);
  });
}

// P2
for (const [id, system, before, choice, page, stored] of [
  ["P2-1", "light", "none", "Dark", "dark", "dark"],
  ["P2-2", "dark", "none", "Light", "light", "light"],
  ["P2-3", "dark", "none", "Auto", "dark", "none"],
  ["P2-4", "light", "dark", "Auto", "light", "none"],
  ["P2-5", "light", "dark", "Light", "light", "light"],
]) {
  test(`${id} system ${system}, remembered ${before}, pick ${choice} -> page ${page}, remembered ${stored}`, async () => {
    await setSystem(system === "dark");
    if (before !== "none") await seed({ [HOST_A]: before });
    const a = await openTab(URL_A);
    const pageBefore = await pageScheme(a);
    const s = await popupSession(URL_A, choice);
    const pageAfter = await waitScheme(a, page);
    const remembered = (await storedSchemes())[keyOf(HOST_A)] ?? "none";
    assert.equal(pageAfter, page, "page scheme");
    assert.equal(remembered, stored, "remembered scheme");
  });
}

// P3
for (const [id, activated] of [["P3-1", "B"], ["P3-2", "A after B"], ["P3-3", "B after A"]]) {
  test(`${id} switching tabs: activate ${activated}`, async () => {
    await seed({ [HOST_A]: "dark" });
    let a, b;
    const trace = {};
    if (id === "P3-1") {
      b = await openTab(URL_B); a = await openTab(URL_A);
      trace.aBefore = await waitScheme(a, "dark");
      assert.equal(trace.aBefore, "dark", "precondition: A is dark while active");
      trace.result = await waitScheme(b, "light");
      assert.equal(trace.result, "light");
    } else if (id === "P3-2") {
      a = await openTab(URL_A); b = await openTab(URL_B);
      trace.bBefore = await waitScheme(b, "light");
      assert.equal(trace.bBefore, "light", "precondition: B is light while active");
      trace.result = await waitScheme(a, "dark");
      assert.equal(trace.result, "dark");
    } else {
      b = await openTab(URL_B); a = await openTab(URL_A);
      trace.a = await waitScheme(a, "dark");
      assert.equal(trace.a, "dark", "precondition: A is dark while active");
      trace.result = await waitScheme(b, "light");
      assert.equal(trace.result, "light");
    }
  });
}

// P4
for (const [id, from, to, expected] of [["P4-1", "B", "A", "dark"], ["P4-2", "A", "B", "light"], ["P4-3", "A", "A", "dark"]]) {
  test(`${id} navigate active tab ${from} -> ${to}: page prefers ${expected}`, async () => {
    await seed({ [HOST_A]: "dark" });
    const base = { A: URL_A, B: URL_B };
    const h = await openTab(base[from]);
    const fromState = await waitScheme(h, from === "A" ? "dark" : "light");
    await driver.get(base[to] + (from === to ? "next" : ""));
    const result = await waitScheme(h, expected);
    assert.equal(result, expected);
  });
}

// P5
for (const [id, event] of [["P5-1", "reloads"], ["P5-2", "navigates to another page of B"]]) {
  test(`${id} background tab ${event}: active host A stays dark`, async () => {
    await seed({ [HOST_A]: "dark" });
    const b = await openTab(URL_B);
    const a = await openTab(URL_A);
    const pre = await waitScheme(a, "dark");
    assert.equal(pre, "dark", "precondition: A is dark while active");
    await chrome(
      `const t = gBrowser.tabs.find((t) => t.linkedBrowser.currentURI.spec.startsWith("http://127.0.0.1"));
       if (arguments[0] === "reloads") gBrowser.reloadTab(t);
       else t.linkedBrowser.fixupAndLoadURIString("http://127.0.0.1:${PORT}/other", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`,
      event === "reloads" ? "reloads" : "navigates",
    );
    const samples = [];
    for (const wait of [800, 1700]) { await sleep(wait); samples.push(await pageScheme(a)); }
    const stillActive = await driver.getCurrentUrl();
    const diag = await chrome(`return { selected: gBrowser.selectedBrowser.currentURI.spec, overridePref: Services.prefs.getIntPref("layout.css.prefers-color-scheme.content-override") };`);
    assert.deepEqual(samples, ["dark", "dark"]);
  });
}

// P6
for (const [id, storedA, active, expected] of [["P6-1", "dark", "A", "Dark"], ["P6-2", "light", "A", "Light"], ["P6-3", "dark", "B", "Auto"]]) {
  test(`${id} popup for host ${active} with A remembering ${storedA} marks ${expected}`, async () => {
    await seed({ [HOST_A]: storedA });
    if (active === "A") await openTab(URL_A); else { await openTab(URL_A); await openTab(URL_B); }
    const s = await popupSession(active === "A" ? URL_A : URL_B);
    const selected = s.before.filter((i) => i.selected).map((i) => i.label);
    assert.deepEqual(selected, [expected]);
  });
}

// P7
for (const [id, url] of [["P7-1", "about:blank"], ["P7-2", "about:robots"]]) {
  test(`${id} tab ${url}: picking Dark remembers nothing`, async () => {
    await driver.switchTo().newWindow("tab");
    created.push(await driver.getWindowHandle());
    if (url !== "about:blank") await driver.get(url);
    await sleep(500);
    const s = await popupSession(url, "Dark", true);
    const schemes = await storedSchemes();
    assert.equal(s.tabUrl, url);
    assert.deepEqual(schemes, {}, "no remembered scheme for any host");
  });
}

// P8
const reloadExtension = async () => {
  await ext(async () => { setTimeout(() => browser.runtime.reload(), 50); return true; });
  await sleep(3000);
  await openExtPage();
};
for (const [id, choice, system, expected] of [
  ["P8-1", "Dark", false, "dark"],
  ["P8-2", "Light", false, "light"],
  ["P8-extra-1 (system dark)", "Light", true, "light"],
]) {
  test(`${id} pick ${choice}, reload extension, reactivate A -> page ${expected}, popup marks ${choice}`, async () => {
    await setSystem(system);
    const a = await openTab(URL_A);
    await popupSession(URL_A, choice);
    const rememberedBefore = (await storedSchemes())[keyOf(HOST_A)];
    await reloadExtension();
    const overrideAfterReload = await overrideValue();
    const home = await openTab("about:blank");
    await sleep(500);
    await driver.switchTo().window(home);
    await sleep(500);
    const page = await waitScheme(a, expected);
    const s = await popupSession(URL_A);
    const selected = s.before.filter((i) => i.selected).map((i) => i.label);
    assert.equal(page, expected, "page scheme after reload and reactivation");
    assert.deepEqual(selected, [choice], "popup marks the choice");
  });
}

// P9
for (const [id, choice] of [["P9-1", "Dark"], ["P9-2", "Light"], ["P9-3", "Auto"]]) {
  test(`${id} toolbar button title names ${choice}`, async () => {
    await openTab(URL_A);
    const s = await popupSession(URL_A, choice);
    assert.match(s.title, new RegExp(choice, "i"));
  });
}

// extras
test("X-P9-auto-after-dark: picking Auto after Dark updates the title to name Auto", async () => {
  await openTab(URL_A);
  const d = await popupSession(URL_A, "Dark");
  const s = await popupSession(URL_A, "Auto");
  assert.match(s.title, /auto/i);
});
test("X-P9-no-file-name: the toolbar title shows no icon file name", async () => {
  await openTab(URL_A);
  const s = await popupSession(URL_A, "Dark");
  assert.doesNotMatch(s.title, /\.svg/i);
});
test("X-P7-popup-ui: on a host-less tab the popup does not show a selected scheme that nothing applied", async () => {
  await driver.switchTo().newWindow("tab");
  created.push(await driver.getWindowHandle());
  const s = await popupSession("about:blank", "Dark", true);
  assert.equal(s.after.find((i) => i.label === "Dark").selected, false);
});
test("X-popup-keyboard: popup scheme items are keyboard focusable", async () => {
  await openTab(URL_A);
  const info = await ext(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = (await browser.tabs.query({})).find((t) => t.url.startsWith("http://localhost:8765"));
    await browser.tabs.update(t.id, { active: true });
    await sleep(500);
    await browser.action.openPopup();
    await sleep(900);
    const [w] = browser.extension.getViews({ type: "popup" });
    const items = [...w.document.querySelectorAll(".panel-list-item[data-scheme], #manage-settings")].map((i) => ({ id: i.id || i.dataset.scheme, tabIndex: i.tabIndex, role: i.getAttribute("role"), tag: i.localName }));
    w.close();
    return items;
  });
  assert.ok(info.every((i) => i.tabIndex >= 0 || i.tag === "button"), JSON.stringify(info));
});


const overrideNow = async () => {
  const p = await chrome('return Services.prefs.getIntPref("layout.css.prefers-color-scheme.content-override")');
  return p === 0 ? "dark" : p === 1 ? "light" : "auto";
};

test("global default applies to a site with no choice, a site choice beats it, popup Auto returns to it", async () => {
  const a = await openTab(URL_A);
  await ext(async () => browser.storage.local.set({ globalColorScheme: "dark" }));
  assert.equal(await waitScheme(a, "dark"), "dark", "global Dark on site A without a choice");
  await popupSession(URL_A, "Light");
  assert.equal(await waitScheme(a, "light"), "light", "site Light beats global Dark");
  await popupSession(URL_A, "Auto");
  assert.equal(await waitScheme(a, "dark"), "dark", "popup Auto returns to the global default");
  assert.equal((await storedSchemes())[keyOf(HOST_A)], undefined, "nothing remembered after Auto");
});

test("activating a tab without a site applies the default, not the previous site's scheme", async () => {
  await seed({ [HOST_A]: "dark" });
  const a = await openTab(URL_A);
  assert.equal(await waitScheme(a, "dark"), "dark");
  await openTab();
  await sleep(1200);
  assert.equal(await overrideNow(), "auto");
});
