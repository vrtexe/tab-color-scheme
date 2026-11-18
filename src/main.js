// @ts-check
"use strict";

import {
  ColorScheme,
  ColorSchemeIcon,
  ColorSchemeLabel,
  GLOBAL_COLOR_SCHEME_KEY,
  colorSchemeStorageManager,
  colorSchemeValueOf,
  extractTabHost,
  storageManager,
} from "./shared.js";

/** @type {string|null|undefined} */
let appliedHost;
let running = false;
let pending = false;

/** Runs one apply at a time and folds events that arrive meanwhile into one follow-up run. */
async function apply() {
  pending = true;
  if (running) return;
  running = true;
  try {
    while (pending) {
      pending = false;
      await applyActiveTabColorScheme().catch(console.error);
    }
  } finally {
    running = false;
  }
}

browser.tabs.onActivated.addListener(apply);
browser.tabs.onUpdated.addListener(
  (_tabId, _changeInfo, tab) => {
    if (tab.active && extractTabHost(tab) !== appliedHost) apply();
  },
  { properties: ["url"] },
);
browser.windows.onFocusChanged.addListener(apply);
browser.storage.onChanged.addListener(apply);
apply();

/** Only writer of the browser-wide override: the active tab's site scheme, else the global default, else Auto. */
async function applyActiveTabColorScheme() {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  // No tab when the focused window is a private window the extension may not access.
  if (!tab) return;

  const host = extractTabHost(tab);
  const siteScheme = host ? await colorSchemeStorageManager(host).get() : undefined;
  const globalScheme = await storageManager(GLOBAL_COLOR_SCHEME_KEY).get();
  const colorScheme = colorSchemeValueOf(siteScheme) || colorSchemeValueOf(globalScheme) || ColorScheme.None;
  const { levelOfControl } = await browser.browserSettings.overrideContentColorScheme.get({});
  if (levelOfControl === "not_controllable" || levelOfControl === "controlled_by_other_extensions") {
    console.error(`Could not set the color scheme to ${colorScheme}: ${levelOfControl}`);
    return;
  }

  if (colorScheme === ColorScheme.None) {
    await browser.browserSettings.overrideContentColorScheme.clear({});
  } else {
    await browser.browserSettings.overrideContentColorScheme.set({ value: colorScheme });
  }

  appliedHost = host;
  setBadge(colorScheme);
}

/**
 * @param {ColorScheme} colorScheme
 */
function setBadge(colorScheme) {
  browser.action.setTitle({ title: `Color scheme: ${ColorSchemeLabel[colorScheme]}` });
  browser.action.setIcon({
    path: {
      16: `/icons/${ColorSchemeIcon[colorScheme]}`,
      32: `/icons/${ColorSchemeIcon[colorScheme]}`,
    },
  });
}
