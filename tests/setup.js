// 共用的測試環境設定

const EXTENSION_ID = 'test-extension-id';

// 模擬 chrome.storage.*.get：與真實 API 一致 —— 傳入物件時回傳其預設值，
// 且 callback 一律「非同步」呼叫（真實 Chrome 不會同步回呼）
const storageGet = jest.fn((keys, callback) => {
  const defaults = keys && typeof keys === 'object' && !Array.isArray(keys) ? { ...keys } : {};
  Promise.resolve().then(() => callback(defaults));
});

// 模擬 Chrome Extension API
global.chrome = {
  storage: {
    sync: {
      get: storageGet,
      set: jest.fn((data, callback) => {
        if (callback) callback();
      })
    },
    local: {
      get: storageGet,
      set: jest.fn((data, callback) => {
        if (callback) callback();
      })
    }
  },
  runtime: {
    id: EXTENSION_ID,
    lastError: null,
    onMessage: {
      addListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn((query, callback) => callback([]))
  }
};

// 清除 console.error 警告（避免測試輸出過於雜亂）
global.console.error = jest.fn();
