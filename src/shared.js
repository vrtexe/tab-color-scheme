// @ts-check
'use strict';

export const CLEAR_POPUP_ON_SELECT_KEY = "closePopupOnSelect";


/** @typedef {typeof ColorScheme[keyof typeof ColorScheme]} ColorScheme */
export const ColorScheme = Object.freeze({
  Dark: 'dark',
  Light: 'light',
  None: 'auto',
});

/** @type {readonly ColorScheme[]} */
export const ColorSchemeValues = Object.freeze(Object.values(ColorScheme));

/** @type {Readonly<Record<string, ColorScheme>>} */
// @ts-ignore
export const ColorSchemeValuesMap = Object.freeze(
  Object.fromEntries(
    Object.entries(ColorScheme).map(([key, value]) => [value, key]),
  ),
);

/**
 * @param {string|undefined|null} value
 * @returns {ColorScheme|undefined}
 */
export function colorSchemeValueOf(value) {
  // @ts-ignore
  return ColorScheme[ColorSchemeValuesMap[value?.toLowerCase()]];
}

/** @type {Record<ColorScheme, string>} */
export const ColorSchemeIcon = Object.freeze({
  [ColorScheme.Dark]: 'ThemeIconDark.svg',
  [ColorScheme.Light]: 'ThemeIconLight.svg',
  [ColorScheme.None]: 'ThemeIcon.svg',
});

/**
 * @template T
 * @typedef {{get: () => Promise<T>, set: (value: T) => Promise<void>, remove: () => Promise<void>}} LocalStorageManager<T>
 */

/**
 * @param {string|null|undefined} host
 * @returns {LocalStorageManager<ColorScheme>}
 */
export function colorSchemeStorageManager(host) {
  if (!host) {
    throw new Error('Host is required to create color scheme storage manager');
  }
  const key = colorSchemeKeyOf(host);
  return storageManager(key);
}

/**
 * @template T
 * @param {string} key
 * @returns {LocalStorageManager<T>}
 */
export function storageManager(key) {
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
export function extractTabHost(tab) {
  const url = parseUrl(tab?.url);
  return extractHost(url);
}

/**
 * @param {string} url
 */
export function colorSchemeKeyOf(url) {
  return `settings:${url}:color-scheme`;
}

/**
 *
 * @param {string|undefined|null} url
 * @returns {URL|null}
 */
export function parseUrl(url) {
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
export function extractHost(url) {
  try {
    return url?.host.startsWith('www.') ? url.host.slice(4) : url?.host || null;
  } catch (e) {
    return null;
  }
}

export function getActiveTab() {
  return browser.tabs.query({ active: true });
}
