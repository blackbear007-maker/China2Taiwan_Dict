# 中台翻譯機 — 簡繁轉換 & 台灣用語 Chrome 擴充功能

自動將網頁上的簡體中文轉為繁體中文，並將常見中國用語轉換為台灣用語。

## 功能

- **簡體 → 繁體**：逐字轉換頁面上所有簡體字（OpenCC 字表，4005 字）
- **中國用語 → 台灣用語**：如「软件」→「軟體」、「视频」→「影片」、「鼠标」→「滑鼠」等（8358 筆詞庫，3673 筆白名單防誤轉）
- **動態頁面支援**：透過 MutationObserver 監聽 SPA / 無限捲動新增的內容
- **一鍵開關**：點擊工具列圖示直接切換啟用/停用，無彈出視窗，無需重整頁面；停用時圖示顯示紅色 ✕ badge
- **完全離線**：無任何網路請求，不蒐集、不傳輸任何資料

## 安裝方式（開發者模式）

1. 開啟 Chrome，前往 `chrome://extensions/`
2. 右上角開啟「**開發人員模式**」
3. 點擊「**載入未封裝項目**」
4. 選取本專案資料夾（`China2Taiwan_Dict/`）

## 檔案結構

```
China2Taiwan_Dict/
├── manifest.json          # Chrome 擴充功能清單（MV3）
├── background.js          # Service worker：點擊圖示切換啟停、更新 badge
├── content.js             # 主邏輯：掃描並替換 DOM 文字
├── opencc_data_full.js    # 簡體→繁體字符對照表（OpenCC）
├── dict_tw.js             # 中國用語→台灣用語詞典（繁體 key）
├── whitelist.js           # 白名單：兩岸相同、不需轉換的詞彙
├── tests/                 # Jest 測試
├── icons/
│   ├── icon.svg           # 圖示來源
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── PRIVACY_POLICY.md      # 隱私權政策
├── SECURITY_AUDIT.md      # 安全審計報告
├── SUBMISSION_CHECKLIST.md# 上架前檢查清單
└── README.md
```

## 詞典擴充

- **新增中國用語詞彙**：編輯 `dict_tw.js`，在 `CHINA_TO_TW` 物件中加入 `"中國用語": "台灣用語"`（key 需為繁體，因流程為先簡轉繁再查詞庫）
- **新增簡繁對照**：編輯 `opencc_data_full.js`，在 `SIMP_TO_TRAD` 物件中加入 `"簡": "繁"`
- **排除誤轉**：編輯 `whitelist.js`，將不該轉換的詞加入 `WHITELIST`

## 執行測試

本專案使用 Jest（jsdom 環境）進行單元與整合測試。

```bash
npm install
```

```bash
npm test
```

測試涵蓋：簡繁轉換、詞彙替換、email / 英數字串保護、長文字分段、停用→啟用即時切換。

## 打包上架

```bash
python build_zip.py
```

產生 `China2Taiwan_Dict-v<版本>.zip`（僅含 manifest、腳本、詞庫與圖示；路徑分隔符為 `/`）。

## 隱私權政策

請參閱 `PRIVACY_POLICY.md`。本擴充功能不會收集個人識別資料，所有轉換均在本地完成。

## 權限說明

- `storage`：記住啟用／停用狀態（僅存本機）。
- 主機權限 `http://*/*`、`https://*/*`：內容腳本需要讀取與修改網頁上的文字，才能進行轉換。不注入 `file://` 等其他協定。

本擴充功能不會讀取或傳輸任何個人資料、密碼、表單內容或瀏覽紀錄至外部伺服器。

## 修改紀錄

| 日期 | 類型 | 說明 |
|------|------|------|
| 2026-06-22 | 移除條目 | 移除 `dict_tw.js` 中「考核」→「考覈」的轉換，因「考核」為台灣通用詞，不需轉換 |
| 2026-06-22 | 批次移除（68筆） | 移除核→覈類（核查、核查制度、核復）及才→纔類（剛才、方才、才不、才對等53筆），這些均為台灣現代通用詞，不需轉換為罕用舊字 |
| 2026-06-22 | 新功能 v1.2.0 | 點擊圖示一鍵切換啟用/停用，不彈視窗、不需重整頁面；停用時顯示紅色 ✕ badge。新增 `background.js` service worker |
| 2026-07-11 | 安全修正 v1.2.1 | 移除未使用的 `activeTab`、`scripting` 權限；`onMessage` 加上 `sender.id` 驗證；新增 `SECURITY_AUDIT.md` |
| 2026-11-06 | 修正 v1.2.2 | 修正「停用狀態下載入的頁面，點擊啟用後不會轉換」的 bug；停用後不再被 observer 重啟；host 權限由 `<all_urls>` 縮小為 http/https；補回 Jest 測試設定並新增切換測試；文件與 manifest 同步（名稱統一為「中台翻譯機」） |
