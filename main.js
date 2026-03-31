'use strict';

/** @typedef {typeof ColorScheme[keyof typeof ColorScheme]} ColorScheme */
const ColorScheme = Object.freeze({
  dark: 'dark',
  light: 'light',
  none: 'auto',
});

/** @type {ColorScheme[]} */
const ColorSchemeValues = Object.freeze(Object.values(ColorScheme));

/** @type {Record<string, ColorScheme>} */
const ColorSchemeValuesMap = Object.freeze(
  Object.fromEntries(
    Object.entries(ColorScheme).map(([key, value]) => [value, key]),
  ),
);

/**
 * @param {string|undefined|null} value
 * @returns {ColorScheme|undefined}
 */
function colorSchemeValueOf(value) {
  return ColorScheme[ColorSchemeValuesMap[value?.toLowerCase()]];
}

/** @type {Record<ColorScheme, string>} */
const ColorSchemeIcon = Object.freeze({
  [ColorScheme.dark]: 'ThemeIconDark.svg',
  [ColorScheme.light]: 'ThemeIconLight.svg',
  [ColorScheme.none]: 'ThemeIcon.svg',
});

function detectDarkScheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * @param {ColorScheme} colorScheme
 */
function setBadge(colorScheme) {
  browser.action.setTitle({
    title: `Set color scheme to ${ColorSchemeIcon[colorScheme]}`,
  });
  browser.action.setIcon({
    path: {
      16: `icons/${ColorSchemeIcon[colorScheme]}`,
      32: `icons/${ColorSchemeIcon[colorScheme]}`,
    },
  });
}

/**
 * @param {browser.tabs.Tab} tab
 */
async function cycleScheme(tab) {
  const host = extractTabHost(tab);
  const colorSchemeStorage = colorSchemeStorageManager(host);

  const value = await colorSchemeStorage.get();
  const colorScheme = colorSchemeValueOf(value) || ColorScheme.none;

  const nextColorScheme =
    ColorSchemeValues[
      (ColorSchemeValues.indexOf(colorScheme) + 1) % ColorSchemeValues.length
    ];

  if (nextColorScheme !== ColorScheme.none) {
    colorSchemeStorage.set(nextColorScheme);
  } else {
    colorSchemeStorage.remove();
  }
  setColorScheme(nextColorScheme);
}

/**
 * @param {string} host
 * @returns {LocalStorageManager<string>}
 */
function colorSchemeStorageManager(host) {
  const key = colorSchemeKeyOf(host);
  return storageManager(key);
}

/**
 * @template T
 * @typedef {{get: () => Promise<T>, set: (value: T) => Promise<void>, remove: () => Promise<void>}} LocalStorageManager<T>
 */

/**
 * @template T
 * @param {string} key
 * @returns {LocalStorageManager<T>}
 */
function storageManager(key) {
  // const key = colorSchemeKeyOf(host);
  return Object.freeze({
    get: async () => {
      const { [key]: value } = await browser.storage.local.get([key]);
      return value;
    },
    set: async (value) => await browser.storage.local.set({ [key]: value }),
    remove: async () => await browser.storage.local.remove(key),
  });
}

/**
 *
 * @param {browser.tabs.Tab|undefined} tab
 * @returns {string|null}
 */
function extractTabHost(tab) {
  const url = parseUrl(tab?.url);
  return extractHost(url);
}

/**
 * @param {string} url
 */
function colorSchemeKeyOf(url) {
  return `settings:${url}:color-scheme`;
}

/**
 *
 * @param {string|undefined|null} url
 * @returns {URL|null}
 */
function parseUrl(url) {
  try {
    return url ? new URL(url) : null;
  } catch (e) {
    return null;
  }
}

/**
 *
 * @param {URL|undefined|null} url
 * @returns {string|null}
 */
function extractHost(url) {
  try {
    return url.host.startsWith('www.') ? url.host.slice(4) : url.host;
  } catch (e) {
    return null;
  }
}

function getActiveTab() {
  return browser.tabs.query({ active: true });
}

async function main() {
  try {
    await browser.browserSettings.overrideContentColorScheme.onChange.addListener(
      handleColorSchemeUpdate,
    );

    browser.tabs.onActivated.addListener(async (activeTab) => {
      const tab = await browser.tabs.get(activeTab.tabId);
      await onTabChange(tab);
    });
    browser.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
      onTabChange(tab);
    });

    browser.action.onClicked.addListener(cycleScheme);
  } catch (e) {
    console.error(e);
  }
}

// const cachedStorageManagers = new Map();

/**
 * @param {browser.tabs.Tab} tab
 */
async function onTabChange(tab) {
  const host = extractTabHost(tab);

  // const colorSchemeStorage = cachedStorageManagers.get(host)
  //   ? colorSchemeStorageManager(host)
  //   : (() => {
  //       const n = colorSchemeStorageManager(host);
  //       cachedStorageManagers.set(host, n);
  //       return n;
  //     })();
  // theme.colors

  const colorSchemeStorage = colorSchemeStorageManager(host);

  const value = await colorSchemeStorage.get();
  const colorScheme = colorSchemeValueOf(value) || ColorScheme.none;

  setColorScheme(colorScheme);
}

function handleColorSchemeUpdate({ value }) {
  setBadge(value);
}

function setColorScheme(colorScheme) {
  browser.browserSettings.overrideContentColorScheme.set({
    value: colorScheme,
  });
}

main();
