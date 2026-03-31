function init() {
  document
    .getElementById('global-theme-form')
    .addEventListener('submit', (event) => {
      event.preventDefault();
      save();
    });
}

function save() {
  const theme = document.getElementById('global-theme-select').value;
  browser.storage.local.set({ globalOverride: theme });
  browser.runtime.sendMessage({ globalOverride: theme });
}

init();
