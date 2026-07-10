# 中台翻譯機 (China2Taiwan_Dict) — 安全審計報告

**審計日期**: 2026-07-11
**審計範圍**: Chrome 擴充功能 (Manifest V3) — content script / service worker / 詞庫資料
**整體嚴重程度**: 低（無高風險漏洞）

---

## 執行摘要

本擴充功能為**純前端、完全離線**的網頁文字轉換工具（簡體→繁體、中國用語→台灣用語）。
審計未發現高風險漏洞。程式碼在關鍵處理上採用了安全做法：

- ✅ **無任何網路連線**（無 `fetch` / `XMLHttpRequest`），使用者瀏覽內容不會外洩。
- ✅ **無 DOM 注入風險**：文字替換僅透過 `node.nodeValue`（純文字），未使用 `innerHTML` / `document.write` / `eval` / `Function()`，不會將頁面文字當作 HTML 解析，杜絕 XSS 注入。
- ✅ **CSP 已設定**：`script-src 'self'; object-src 'self'`，禁止載入外部/內聯腳本。
- ✅ **輸入區保護**：偵測 `contentEditable` / `role=textbox|combobox|searchbox`，不竄改使用者輸入框內容。
- ✅ **測試專用函數受保護**：內部函數僅在 `window.__CHINA2TAIWAN_TEST_MODE__` 下暴露，生產環境不洩漏字典。

發現 **1 項中風險**（權限過度）與 **2 項低風險**（最佳實務）建議，詳見下方。

---

## 發現的問題與建議

### 🟡 中風險 1：宣告了未使用的權限（Over-permissioning）

**檔案**: [manifest.json:19](manifest.json)

```json
"permissions": ["activeTab", "scripting", "storage"],
```

全專案掃描結果：
- `chrome.scripting.*` — **完全未使用**
- `activeTab`（配合 `chrome.scripting` 或 `chrome.tabs.executeScript`）— **未使用**
- 實際只用到 `chrome.storage`、`chrome.action`、`chrome.tabs.sendMessage`、`chrome.runtime`

**風險**：
1. 違反最小權限原則，擴大攻擊面。
2. Chrome Web Store 審查常因「宣告但未使用的權限」退件或要求說明。

**修復建議**：移除 `activeTab` 與 `scripting`。
> 注意：`chrome.tabs.sendMessage` 屬於 `tabs` 家族但**不需要** `tabs` 權限即可對已注入 content script 的分頁發訊，故無需新增 `tabs` 權限。

```json
"permissions": ["storage"],
```

---

### 🟢 低風險 2：`runtime.onMessage` 未驗證訊息來源

**檔案**: [content.js:602](content.js:602)

```js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'TOGGLE_TRANSLATION') return;
  ...
});
```

**現況**：由於 manifest 未宣告 `externally_connectable`，一般網頁**無法**送訊息到此 listener，實際風險很低。訊息僅來自本擴充功能的 `background.js`。

**最佳實務建議**：加上 `sender` 驗證，明確只接受來自自身擴充功能的訊息，避免未來若擴充功能新增外部連線能力時被濫用。

```js
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id) return;   // 僅接受自身來源
  if (msg?.type !== 'TOGGLE_TRANSLATION') return;
  ...
});
```

---

### 🟢 低風險 3：`<all_urls>` 全網域注入

**檔案**: [manifest.json:22](manifest.json)

```json
"matches": ["<all_urls>"]
```

**評估**：對「自動翻譯任何網頁」的工具而言，全網域注入是**功能所需、屬合理設計**，並非漏洞。

**注意事項**：
- 這是使用者隱私最敏感的權限，Chrome Web Store 上架時**務必在說明中清楚交代用途**，並與 [PRIVACY_POLICY.md](PRIVACY_POLICY.md) 一致（「不蒐集、不傳送任何資料」）。
- 已確認程式碼實際行為與隱私政策相符（無外送資料），符合規範。

---

## 已檢查且未發現問題的項目

| 檢查項目 | 結果 |
|---|---|
| 硬編碼密鑰 / API key / token | ✅ 無（本擴充功能無需任何憑證） |
| 網路請求 / 資料外送 | ✅ 無任何 `fetch` / `XHR` / WebSocket |
| XSS / HTML 注入（`innerHTML`, `document.write`） | ✅ 生產碼未使用，僅測試檔用於建構測試 DOM |
| 動態程式碼執行（`eval`, `Function`, `setTimeout(字串)`） | ✅ 無 |
| CSP 設定 | ✅ 已限制 `script-src 'self'` |
| 敏感資訊寫入 log | ✅ `China2Taiwan_Dict.log` 僅為開發變更紀錄，無敏感資料 |
| `.gitignore` 外洩風險 | ✅ 已排除 `*.log`（例外保留變更日誌）、`*.zip`、`node_modules` |
| ReDoS（正規表示式阻斷）| ✅ 詞庫 regex 由固定字串轉義組成，並過濾 >100 字長詞；另有 Trie 為主要匹配路徑 |
| 使用者輸入框竄改 | ✅ 已排除可編輯區域 |
| Service Worker 權限操作 | ✅ 僅切換 storage 旗標與 badge，無高風險 API |

---

## 建議的後續改進（優先序）

1.（中）移除 `manifest.json` 中未使用的 `activeTab`、`scripting` 權限 → 降低上架被退件風險。
2.（低）`content.js` 的 `onMessage` 加上 `sender.id` 驗證。
3.（低）於 Web Store 上架說明明確交代 `<all_urls>` 用途，維持與隱私政策一致。

---

## 環境變量配置要求

**無**。本擴充功能不需要任何環境變數、API 金鑰或後端服務，完全在瀏覽器本機離線運作。

---

## 結論

**中台翻譯機**的安全設計良好：離線運作、無資料外送、以純文字方式操作 DOM 避免注入風險、已設定 CSP 並保護使用者輸入區。**未發現任何高風險漏洞**。

唯一需優先處理的是**移除未使用的權限**（`activeTab`、`scripting`），此為最小權限原則與 Chrome Web Store 審查的實務要求。其餘為強化型的最佳實務建議，可視需要採用。

**目前安全狀態：良好（可安全上架，建議先套用權限精簡）。**
