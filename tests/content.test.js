/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

const loadScript = (filename) => {
  const filePath = path.join(__dirname, '..', filename);
  return fs.readFileSync(filePath, 'utf8');
};

const runExtensionScripts = () => {
  // 啟用測試模式，讓 content.js 暴露內部函數
  window.__CHINA2TAIWAN_TEST_MODE__ = true;

  const scripts = [
    'opencc_data_full.js',
    'dict_tw.js',
    'content.js'
  ].map(loadScript).join('\n');

  // 在 window 全域環境執行，讓 dict / content 腳本能互相存取
  window.eval(scripts);
};

describe('content.js - 簡繁轉換與詞彙替換', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="test">软件</div>';
  });

  test('應將「软件」轉換為「軟體」', (done) => {
    runExtensionScripts();

    // 等待異步字典初始化與初始執行
    setTimeout(() => {
      const el = document.getElementById('test');
      expect(el.textContent).toBe('軟體');
      done();
    }, 500);
  });

  test('應將「鼠标」轉換為「滑鼠」', (done) => {
    document.body.innerHTML = '<div id="test">鼠标</div>';
    runExtensionScripts();

    setTimeout(() => {
      const el = document.getElementById('test');
      expect(el.textContent).toBe('滑鼠');
      done();
    }, 500);
  });

  test('應保留英文與 email 不被轉換', (done) => {
    document.body.innerHTML = '<div id="test">user@example.com 软件</div>';
    runExtensionScripts();

    setTimeout(() => {
      const el = document.getElementById('test');
      expect(el.textContent).toBe('user@example.com 軟體');
      done();
    }, 500);
  });

  test('長文字應被分段處理而不會被跳過', (done) => {
    const longText = '软件' + 'a'.repeat(12000) + '鼠标';
    document.body.innerHTML = `<div id="test">${longText}</div>`;
    runExtensionScripts();

    setTimeout(() => {
      const el = document.getElementById('test');
      const text = el.textContent;
      expect(text.startsWith('軟體')).toBe(true);
      expect(text.endsWith('滑鼠')).toBe(true);
      done();
    }, 500);
  });
});

describe('content.js - 長文字分段函數', () => {
  test('splitTextIntoChunks 應在標點處切分', () => {
    runExtensionScripts();
    const { splitTextIntoChunks } = window.__china2taiwanTest;
    const text = 'a'.repeat(50) + '，' + 'b'.repeat(50) + '。' + 'c'.repeat(50);
    const chunks = splitTextIntoChunks(text, 30);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(c => c.length <= 30)).toBe(true);
  });
});
