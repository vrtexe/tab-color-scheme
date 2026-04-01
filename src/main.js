// @ts-check
"use strict";

import {
  ColorScheme,
  ColorSchemeIcon,
  colorSchemeStorageManager,
  colorSchemeValueOf,
  extractTabHost,
} from "./shared.js";

async function main() {
  try {
    await browser.browserSettings.overrideContentColorScheme.onChange.addListener(handleColorSchemeUpdate);

    browser.tabs.onActivated.addListener(async (activeTab) => {
      const tab = await browser.tabs.get(activeTab.tabId);
      await onTabChange(tab);
    });

    browser.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
      onTabChange(tab);
    });

    browser.runtime.onMessage.addListener(({ colorScheme, host }) => {
      if (!colorScheme || !host) {
        return;
      }

      updateColorScheme({
        value: colorSchemeValueOf(colorScheme) || ColorScheme.None,
        host,
      });
    });
  } catch (e) {
    console.error(e);
  }
}

/**
 * @param {{value: ColorScheme, host: string}} param0
 */
async function updateColorScheme({ value, host }) {
  const colorScheme = colorSchemeValueOf(value) || ColorScheme.None;
  const colorSchemeStorage = colorSchemeStorageManager(host);

  if (colorScheme !== ColorScheme.None) {
    colorSchemeStorage.set(colorScheme);
  } else {
    colorSchemeStorage.remove();
  }

  setColorScheme(colorScheme);
}

/**
 * @param {ColorScheme} colorScheme
 */
function setBadge(colorScheme) {
  browser.action.setTitle({
    title: `Set color scheme to ${ColorSchemeIcon[colorScheme]}`,
  });
  // browser.action.setIcon({});
  browser.action.setIcon({
    path: {
      16: `icons/${ColorSchemeIcon[colorScheme]}`,
      32: `icons/${ColorSchemeIcon[colorScheme]}`,
    },
  });
}

// const cachedStorageManagers = new Map();
// const colorSchemeStorage = cachedStorageManagers.get(host)
//   ? colorSchemeStorageManager(host)
//   : (() => {
//       const n = colorSchemeStorageManager(host);
//       cachedStorageManagers.set(host, n);
//       return n;
//     })();
// theme.colors

/**
 * @param {browser.tabs.Tab} tab
 */
async function onTabChange(tab) {
  const host = extractTabHost(tab);
  if (!host) return;

  const colorSchemeStorage = colorSchemeStorageManager(host);

  const value = await colorSchemeStorage.get();
  const colorScheme = colorSchemeValueOf(value) || ColorScheme.None;

  if ((await getColorScheme()) === colorScheme) {
    return;
  }

  setColorScheme(colorScheme);
}

/**
 *
 * @param {{value: ColorScheme}} param0
 */
function handleColorSchemeUpdate({ value }) {
  setBadge(value);
}

/**
 * @param {ColorScheme} colorScheme
 */
function setColorScheme(colorScheme) {
  if (colorScheme === ColorScheme.None) {
    browser.browserSettings.overrideContentColorScheme.clear({});
    return;
  }

  browser.browserSettings.overrideContentColorScheme.set({
    value: colorScheme,
  });
}

async function getColorScheme() {
  const result = await browser.browserSettings.overrideContentColorScheme.get({});
  return colorSchemeValueOf(result.value) || ColorScheme.None;
}

main();
