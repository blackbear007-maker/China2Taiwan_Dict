// background.js — Service Worker
// 點擊 icon 切換啟用/停用，更新 badge，通知 content script 即時套用

chrome.action.onClicked.addListener(async (tab) => {
  const { translationEnabled = true } = await chrome.storage.local.get({ translationEnabled: true });
  const newState = !translationEnabled;

  await chrome.storage.local.set({ translationEnabled: newState });
  updateBadge(newState);

  // 通知目前頁面的 content script 即時切換
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_TRANSLATION', enabled: newState });
  } catch (_) {
    // 該頁面可能沒有 content script（如 chrome:// 頁面），忽略
  }
});

// 啟動時同步 badge 狀態
chrome.runtime.onStartup.addListener(async () => {
  const { translationEnabled = true } = await chrome.storage.local.get({ translationEnabled: true });
  updateBadge(translationEnabled);
});

chrome.runtime.onInstalled.addListener(async () => {
  const { translationEnabled = true } = await chrome.storage.local.get({ translationEnabled: true });
  updateBadge(translationEnabled);
});

function updateBadge(enabled) {
  if (enabled) {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: '中台翻譯機（啟用中）' });
  } else {
    chrome.action.setBadgeText({ text: '✕' });
    chrome.action.setBadgeBackgroundColor({ color: '#CC0000' });
    chrome.action.setTitle({ title: '中台翻譯機（已停用）' });
  }
}
