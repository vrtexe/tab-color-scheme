// @ts-check
"use strict";

import {
  CLEAR_POPUP_ON_SELECT_KEY,
  ColorScheme,
  GLOBAL_COLOR_SCHEME_KEY,
  colorSchemeValueOf,
  storageManager,
} from "../shared.js";

async function init() {
  /** @type {import("../shared.js").LocalStorageManager<ColorScheme>} */
  const globalSchemeStorage = storageManager(GLOBAL_COLOR_SCHEME_KEY);
  /** @type {import("../shared.js").LocalStorageManager<string>} */
  const clearPopupStorage = storageManager(CLEAR_POPUP_ON_SELECT_KEY);

  selectOption(await globalSchemeStorage.get());
  browser.storage.onChanged.addListener((changes) => {
    if (GLOBAL_COLOR_SCHEME_KEY in changes) selectOption(changes[GLOBAL_COLOR_SCHEME_KEY].newValue);
  });

  for (const radio of queryGlobalThemeRadios()) {
    radio.addEventListener("change", async () => {
      const scheme = colorSchemeValueOf(radio.value) || ColorScheme.None;
      if (scheme === ColorScheme.None) {
        await globalSchemeStorage.remove();
      } else {
        await globalSchemeStorage.set(scheme);
      }
    });
  }

  const closePopupCheckbox = /** @type {HTMLInputElement} */ (document.getElementById("closePopupOnSelect"));
  closePopupCheckbox.checked = (await clearPopupStorage.get()) === "true";
  closePopupCheckbox.addEventListener("change", async () => {
    await clearPopupStorage.set(closePopupCheckbox.checked.toString());
  });
}

/**
 * @returns {NodeListOf<HTMLInputElement>}
 */
function queryGlobalThemeRadios() {
  return document.querySelectorAll('input[name="globalTheme"]');
}

/**
 * @param {string|undefined} value
 */
function selectOption(value) {
  const scheme = colorSchemeValueOf(value) || ColorScheme.None;
  for (const radio of queryGlobalThemeRadios()) radio.checked = radio.value === scheme;
}

init();
