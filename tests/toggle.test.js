/**
 * @jest-environment jsdom
 */

// 獨立檔案：每個測試檔擁有全新的 jsdom，避免先前測試遺留的 MutationObserver 干擾

const fs = require('fs');
const path = require('path');

const loadScript = (filename) =>
  fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('content.js - 停用狀態載入後即時啟用', () => {
  test('停用中載入的頁面，收到啟用訊息後應立即轉換（不需重整）', async () => {
    document.body.innerHTML = '<div id="test">软件</div>';

    // 模擬 storage 中 translationEnabled = false（頁面在停用狀態下載入）
    chrome.storage.local.get.mockImplementationOnce((keys, cb) =>
      Promise.resolve().then(() => cb({ translationEnabled: false }))
    );

    window.eval(
      ['opencc_data_full.js', 'dict_tw.js', 'content.js'].map(loadScript).join('\n')
    );

    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
    expect(typeof listener).toBe('function');

    // 停用中：不得轉換
    await sleep(300);
    expect(document.getElementById('test').textContent).toBe('软件');

    // 非本擴充功能來源的訊息：必須被忽略
    listener({ type: 'TOGGLE_TRANSLATION', enabled: true }, { id: 'someone-else' });
    await sleep(300);
    expect(document.getElementById('test').textContent).toBe('软件');

    // 來自本擴充功能的啟用訊息：整頁立即轉換
    listener(
      { type: 'TOGGLE_TRANSLATION', enabled: true },
      { id: chrome.runtime.id }
    );
    await sleep(500);
    expect(document.getElementById('test').textContent).toBe('軟體');

    // 啟用後新增的動態內容也應被轉換（observer 已啟動）
    const added = document.createElement('p');
    added.id = 'added';
    added.textContent = '鼠标';
    document.body.appendChild(added);
    await sleep(500);
    expect(document.getElementById('added').textContent).toBe('滑鼠');

    // 再次停用：新增內容不再轉換
    listener(
      { type: 'TOGGLE_TRANSLATION', enabled: false },
      { id: chrome.runtime.id }
    );
    const late = document.createElement('p');
    late.id = 'late';
    late.textContent = '鼠标';
    document.body.appendChild(late);
    await sleep(500);
    expect(document.getElementById('late').textContent).toBe('鼠标');
  });
});
