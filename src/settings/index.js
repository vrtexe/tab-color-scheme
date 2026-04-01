// @ts-check
"use strict";

import { CLEAR_POPUP_ON_SELECT_KEY, ColorScheme, colorSchemeValueOf, storageManager } from "../shared.js";

/** @type {readonly {value: string, scheme: ColorScheme}[]} */
const THEME_OPTIONS = Object.freeze([
  { value: "auto", scheme: ColorScheme.None },
  { value: "light", scheme: ColorScheme.Light },
  { value: "dark", scheme: ColorScheme.Dark },
]);

async function init() {
  const saved = await getColorScheme();
  const current = colorSchemeValueOf(saved) || ColorScheme.None;
  /** @type {import("../shared.js").LocalStorageManager<string>} */
  const clearPopupStorage = storageManager(CLEAR_POPUP_ON_SELECT_KEY);
  selectOption(current);

  queryGlobalThemeRadios().forEach((radio) => {
    radio.addEventListener("change", () => {
      save(radio.value);
    });
  });

  onColorSchemeUpdate(selectOption);

  const closePopupCheckbox = /** @type {HTMLInputElement} */ (document.getElementById("closePopupOnSelect"));
  const closePopupOnSelect = (await clearPopupStorage.get()) === "true";
  closePopupCheckbox.checked = closePopupOnSelect;
  closePopupCheckbox.addEventListener("change", () => {
    clearPopupStorage.set(closePopupCheckbox.checked.toString());
  });
}

/**
 * @returns {NodeListOf<HTMLInputElement>}
 */
function queryGlobalThemeRadios() {
  return document.querySelectorAll('input[name="globalTheme"]');
}

/**
 * @param {ColorScheme} colorScheme
 */
function selectOption(colorScheme) {
  const match = THEME_OPTIONS.find((o) => o.scheme === colorScheme);
  if (!match) {
    return;
  }

  /** @type {HTMLInputElement|null} */
  const radio = document.querySelector(`input[name="globalTheme"][value="${match.value}"]`);
  if (radio) radio.checked = true;
}

/**
 * @param {string} value
 */
async function save(value) {
  const option = THEME_OPTIONS.find((o) => o.value === value);
  if (!option) return;

  setColorScheme(option.scheme);
}

/**
 * @param {ColorScheme} colorScheme
 */
function setColorScheme(colorScheme) {
  browser.browserSettings.overrideContentColorScheme.set({
    value: colorScheme,
  });
}

async function getColorScheme() {
  const result = await browser.browserSettings.overrideContentColorScheme.get({});
  return colorSchemeValueOf(result.value) || ColorScheme.None;
}

/**
 * @param {(value: ColorScheme) => void|unknown} handle
 */
async function onColorSchemeUpdate(handle) {
  /**
   * @param {ColorScheme} value
   */
  const listener = (value) => {
    console.log("here", value);
    handle(value);
  };

  let currentValue = await getColorScheme();

  const interval = setInterval(async () => {
    const nextValue = await getColorScheme();
    if (currentValue !== nextValue) {
      currentValue = nextValue;
      listener(currentValue);
    }
  }, 1000);

  return () => clearInterval(interval);
}

init();
