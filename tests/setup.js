// 共用的測試環境設定

// 模擬 Chrome Extension API
global.chrome = {
  storage: {
    sync: {
      get: jest.fn((keys, callback) => callback({})),
      set: jest.fn((data, callback) => {
        if (callback) callback();
      })
    },
    local: {
      set: jest.fn((data, callback) => {
        if (callback) callback();
      }),
      get: jest.fn((keys, callback) => callback({}))
    }
  },
  runtime: {
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
