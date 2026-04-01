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

/**
 * @param {HTMLElement} item
 * @returns {HTMLElement|null}
 */
function queryBadgeElement(item) {
  return item.querySelector(".panel-list-item-badge");
}

async function initPopup() {
  const items = queryListItems();
  const [tab] = await getActiveTab();
  const host = extractTabHost(tab);

  /** @type {import("../shared.js").LocalStorageManager<string>} */
  const clearPopupStorage = storageManager(CLEAR_POPUP_ON_SELECT_KEY);

  const clearPopup = (await clearPopupStorage.get()) === "true";

  const colorSchemeStorage = host ? colorSchemeStorageManager(host) : null;
  const currentScheme = (await colorSchemeStorage?.get?.()) || ColorScheme.None;

  for (const item of items) {
    const scheme = colorSchemeValueOf(item.dataset.scheme);
    const badge = queryBadgeElement(item);

    if (scheme === currentScheme) {
      item.classList.add("selected");
      item.setAttribute("aria-selected", "true");
      if (badge) badge.classList.add("active");
    }

    item.addEventListener("click", () => {
      selectScheme(scheme, host);
      clearPopup && window.close();
    });
  }

  // Settings link
  const settingsItem = document.getElementById("manage-settings");
  if (settingsItem) {
    settingsItem.addEventListener("click", () => {
      browser.runtime.openOptionsPage();
      window.close();
    });
  }
}

/**
 * @param {ColorScheme|undefined} colorScheme
 * @param {string|undefined|null} host
 */
async function selectScheme(colorScheme, host) {
  if (host) {
    await browser.runtime.sendMessage({ colorScheme, host });
  }

  // Update UI
  const items = queryListItems();
  for (const item of items) {
    const badge = queryBadgeElement(item);
    const itemColorScheme = colorSchemeValueOf(item.dataset.scheme);
    const isSelected = itemColorScheme === colorScheme;

    item.classList.toggle("selected", isSelected);
    item.setAttribute("aria-selected", String(isSelected));
    if (badge) badge.classList.toggle("active", isSelected);
  }
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

async function getActiveTab() {
  return await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
}

/**
 * @returns {NodeListOf<HTMLElement>}
 */
function queryListItems() {
  return document.querySelectorAll(".panel-list-item[data-scheme]");
}

document.addEventListener("DOMContentLoaded", updateThemeColors);
document.addEventListener("DOMContentLoaded", initPopup);
