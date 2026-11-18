// @ts-check
"use strict";
import {
  ColorScheme,
  extractTabHost,
  colorSchemeStorageManager,
  colorSchemeValueOf,
  storageManager,
  CLEAR_POPUP_ON_SELECT_KEY,
} from "../shared.js";

async function initPopup() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const host = extractTabHost(tab);

  /** @type {import("../shared.js").LocalStorageManager<string>} */
  const clearPopupStorage = storageManager(CLEAR_POPUP_ON_SELECT_KEY);
  const clearPopup = (await clearPopupStorage.get()) === "true";

  const colorSchemeStorage = host ? colorSchemeStorageManager(host) : null;
  const currentScheme = colorSchemeStorage ? colorSchemeValueOf(await colorSchemeStorage.get()) || ColorScheme.None : null;

  for (const item of queryListItems()) {
    const scheme = colorSchemeValueOf(item.dataset.scheme) || ColorScheme.None;
    markSelected(item, scheme === currentScheme);
    if (!colorSchemeStorage) {
      item.disabled = true;
      continue;
    }

    item.addEventListener("click", async () => {
      await (scheme === ColorScheme.None ? colorSchemeStorage.remove() : colorSchemeStorage.set(scheme));
      for (const other of queryListItems()) markSelected(other, other === item);
      if (clearPopup) window.close();
    });
  }

  document.getElementById("manage-settings")?.addEventListener("click", async () => {
    await browser.runtime.openOptionsPage();
    window.close();
  });
}

/**
 * @param {HTMLButtonElement} item
 * @param {boolean} selected
 */
function markSelected(item, selected) {
  item.classList.toggle("selected", selected);
  item.setAttribute("aria-pressed", String(selected));
  item.querySelector(".panel-list-item-badge")?.classList.toggle("active", selected);
}

async function updateThemeColors() {
  try {
    const theme = await browser.theme.getCurrent();
    if (!theme?.colors) return;

    document.documentElement.style.setProperty("--popup", theme.colors.popup?.toString() || null);
    document.documentElement.style.setProperty("--popup_border", theme.colors.popup_border?.toString() || null);
    document.documentElement.style.setProperty("--popup_highlight", theme.colors.popup_highlight?.toString() || null);
    document.documentElement.style.setProperty(
      "--popup_highlight_text",
      theme.colors.popup_highlight_text?.toString() || null,
    );
    document.documentElement.style.setProperty("--popup_text", theme.colors.popup_text?.toString() || null);
  } catch (error) {
    console.error("Failed to get theme colors:", error);
  }
}

/**
 * @returns {NodeListOf<HTMLButtonElement>}
 */
function queryListItems() {
  return document.querySelectorAll(".panel-list-item[data-scheme]");
}

document.addEventListener("DOMContentLoaded", updateThemeColors);
document.addEventListener("DOMContentLoaded", initPopup);
