// background.js — service worker
// Opens the side panel when the extension icon is clicked.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
