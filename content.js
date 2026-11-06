(() => {
  // ===== 白名單（外部 whitelist.js 提供 WHITELIST Set） =====
  const whitelistSet = (typeof WHITELIST !== 'undefined') ? WHITELIST : new Set();

  // ===== 常數設定 =====
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "CANVAS",
    "INPUT", "TEXTAREA", "SELECT", "CODE", "PRE", "SVG", "MATH"
  ]);

  // ===== 判斷節點是否在可編輯區域內（輸入區保護） =====
  const _editableCache = new WeakMap(); // 快取爬 DOM 結果，避免重複向上查找
  function isEditableNode(node) {
    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el) return false;
    if (_editableCache.has(el)) return _editableCache.get(el);
    let cur = el;
    while (cur) {
      if (cur.isContentEditable) {
        _editableCache.set(el, true);
        return true;
      }
      const role = cur.getAttribute && cur.getAttribute('role');
      if (role === 'textbox' || role === 'combobox' || role === 'searchbox') {
        _editableCache.set(el, true);
        return true;
      }
      cur = cur.parentElement;
    }
    _editableCache.set(el, false);
    return false;
  }
  
  const MAX_TEXT_LENGTH = 10000;        // 單一文字節點最大處理長度
  const THROTTLE_MS = 100;              // MutationObserver 節流時間
  const BATCH_SIZE = 50;                // 批次處理節點數量

  // ===== 效能優化的字典結構 =====
  let dictMap = new Map();              // O(1) 查詢
  let twPattern = null;
  let patternKeys = [];                 // 用於匹配後查找值
  let phraseTrie = null;                  // Trie 最長匹配自動機
  let isDictionaryReady = false;          // 字典初始化完成標記
  let dictInitScheduled = false;          // 已排程建構字典（避免重複建構）
  let pendingNodes = [];                  // 等待字典就緒的節點佇列
  let translationActive = false;          // 使用者目前是否啟用轉換（控制 observer 是否允許啟動）

  // ===== 初始化字典 =====
  function initDictionary() {
    if (dictInitScheduled) return;
    dictInitScheduled = true;
    // 方案D：使用 requestIdleCallback 非同步建構 Trie，避免阻塞首次渲染
    const build = () => {
      buildPattern({ ...CHINA_TO_TW });
      isDictionaryReady = true;
      processPendingNodes();
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(build, { timeout: 500 });
    } else {
      setTimeout(build, 0);
    }
  }
  
  // 處理等待中的節點
  function processPendingNodes() {
    if (pendingNodes.length > 0) {
      processNodesBatched(pendingNodes);
      pendingNodes = [];
    }
  }

  // ===== 建立高效查詢結構 =====
  function buildPattern(merged) {
    // 依長度降序排列（長詞優先匹配）
    const entries = Object.entries(merged).sort(
      ([a], [b]) => b.length - a.length
    );
    
    // 建立 Map 達到 O(1) 查詢（含所有條目，包括 k=v，供轉換時回查）
    dictMap.clear();
    patternKeys = [];
    
    entries.forEach(([key, value]) => {
      dictMap.set(key, value);
      // 方案A：k=v 條目不進入 patternKeys（不放入 Trie/Regex，縮減 29% 節點）
      // 方案C：白名單詞彙建構時就排除（不需在套用時才過濾）
      if (key !== value && !whitelistSet.has(key)) {
        patternKeys.push(key);
      }
    });
    
    // 建立 Trie 最長匹配自動機（替代單一超大 regex）
    phraseTrie = buildTrie(patternKeys.filter(k => k.length <= 100));
    
    // 保留 regex 作為後備方案（當 Trie 不可用時）
    const safeKeys = patternKeys
      .filter(k => k.length <= 100)  // 過濾超長詞彙
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    
    if (safeKeys.length > 0) {
      try {
        twPattern = new RegExp(safeKeys.join("|"), "g");
      } catch (e) {
        console.error('Regex 建立失敗:', e);
        twPattern = null;
      }
    }
  }

  // ===== Trie 最長匹配自動機 =====
  function buildTrie(patterns) {
    if (patterns.length === 0) return null;
    
    const root = { children: {} };
    for (const pattern of patterns) {
      let node = root;
      for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i];
        if (!node.children[char]) {
          node.children[char] = { children: {} };
        }
        node = node.children[char];
      }
      node.output = pattern;
    }
    
    return root;
  }

  function findTrieMatches(root, text) {
    const matches = [];
    let i = 0;
    
    while (i < text.length) {
      let node = root;
      let bestKey = null;
      let bestEnd = -1;
      
      for (let j = i; j < text.length; j++) {
        const char = text[j];
        if (!node.children[char]) break;
        node = node.children[char];
        if (node.output) {
          bestKey = node.output;
          bestEnd = j + 1;
        }
      }
      
      if (bestKey) {
        matches.push({ start: i, end: bestEnd, key: bestKey });
        i = bestEnd;
      } else {
        i++;
      }
    }
    
    return matches;
  }

  function applyPhraseMatches(text, matches, skipRanges) {
    if (matches.length === 0) return text;
    
    // Trie findTrieMatches 已依左到右、最長優先輸出，無需再次排序
    const parts = [];
    let lastEnd = 0;
    
    for (const match of matches) {
      if (match.start < lastEnd) continue; // 跳過與已應用匹配重疊的短詞
      
      const len = match.end - match.start;
      if (skipRanges && isInSkipRange(match.start, len, skipRanges)) {
        continue; // 跳過 email / 長英數字串
      }
      
      parts.push(text.slice(lastEnd, match.start));
      parts.push(dictMap.get(match.key) || match.key);
      lastEnd = match.end;
    }
    
    parts.push(text.slice(lastEnd));
    return parts.join('');
  }

  // ===== 字元轉換 =====
  function convertChar(char) {
    return SIMP_TO_TRAD[char] || char;
  }

  // ===== 建立跳過區段（電子信箱、連續 10+ 英數字元） =====
  // 回傳布林陣列（O(1) 查詢），true 表示該位置應跳過
  function buildSkipRanges(text) {
    const skipPattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9]{10,}/g;
    let m;
    let skipArr = null; // 延遲建立，大多數純中文文字節點不需要
    while ((m = skipPattern.exec(text)) !== null) {
      if (!skipArr) skipArr = new Uint8Array(text.length);
      skipArr.fill(1, m.index, m.index + m[0].length);
    }
    return skipArr; // null 表示無任何跳過區段
  }

  function isInSkipRange(index, length, skipArr) {
    if (!skipArr) return false;
    const end = Math.min(index + length, skipArr.length);
    for (let i = index; i < end; i++) {
      if (skipArr[i]) return true;
    }
    return false;
  }

  // ===== 長文字分段處理 =====
  // OVERLAP_SIZE：相鄰段落重疊字數，確保跨段落詞彙不漏失（最長詞彙約 20 字）
  const OVERLAP_SIZE = 20;
  function splitTextIntoChunks(text, maxChunkSize) {
    if (text.length <= maxChunkSize) return [text];

    const chunks = [];
    let start = 0;
    const boundaryChars = /[。，！？；：""''（）【】、\s\n\r.,;:!?]/;

    while (start < text.length) {
      let end = Math.min(start + maxChunkSize, text.length);
      if (end >= text.length) {
        chunks.push(text.slice(start));
        break;
      }

      let splitPos = end;
      while (splitPos > start && !boundaryChars.test(text[splitPos])) {
        splitPos--;
      }

      if (splitPos === start) {
        splitPos = end;
      }

      chunks.push(text.slice(start, splitPos));
      // 下一段從 splitPos 往前 OVERLAP_SIZE 開始，確保跨段詞彙能被命中
      start = Math.max(start + 1, splitPos - OVERLAP_SIZE);
    }

    return chunks;
  }

  // ===== Regex 失效時的 fallback 轉換 =====
  function convertTextWithFallback(text, skipRanges) {
    let result = '';
    let i = 0;
    const maxKeyLen = 100;

    while (i < text.length) {
      let matched = false;
      for (let len = Math.min(maxKeyLen, text.length - i); len > 0; len--) {
        const substr = text.substring(i, i + len);
        // 只要這個長度的範圍與任何跳過區段重疊，就嘗試更短長度
        if (skipRanges && isInSkipRange(i, len, skipRanges)) {
          continue;
        }
        if (dictMap.has(substr)) {
          result += whitelistSet.has(substr) ? substr : dictMap.get(substr);
          i += len;
          matched = true;
          break;
        }
      }

      if (!matched) {
        result += text[i];
        i++;
      }
    }

    return result;
  }

  // ===== 單一文字區段轉換 =====
  // 流程：(1) 簡轉繁  (2) 白名單詞彙跳過（已在 buildPattern 排除，Trie 不會命中）  (3) 詞庫替換
  function convertTextChunk(text) {
    // 預先計算需要跳過的區段（email、連續 10+ 英數字元）
    const skipRanges = buildSkipRanges(text);

    // 1. 簡體 → 繁體（逐字，跳過保護區段）
    let result;
    if (!skipRanges) {
      // 無跳過區段：直接逐字轉換，避免建立陣列
      let buf = '';
      for (let i = 0; i < text.length; i++) {
        buf += convertChar(text[i]);
      }
      result = buf;
    } else {
      let buf = '';
      for (let i = 0; i < text.length; i++) {
        buf += skipRanges[i] ? text[i] : convertChar(text[i]);
      }
      result = buf;
    }

    // skipRanges 對繁化後的字串仍適用（逐字轉換不改變字元數與位置）

    // 2. 白名單 + 詞庫替換（Trie key 為繁體，白名單詞彙已在建構時排除）
    if (phraseTrie) {
      const matches = findTrieMatches(phraseTrie, result);
      result = applyPhraseMatches(result, matches, skipRanges);
    } else if (twPattern) {
      twPattern.lastIndex = 0;
      result = result.replace(twPattern, (match, offset) => {
        if (skipRanges && isInSkipRange(offset, match.length, skipRanges)) {
          return match;
        }
        return dictMap.get(match) || match;
      });
    } else if (dictMap.size > 0) {
      result = convertTextWithFallback(result, skipRanges);
    }

    return result;
  }

  // ===== 文字轉換（優化版） =====
  // 快速判斷是否為純 ASCII 可略過文字（避免 Regex 建立開銷）
  function isAsciiOnly(text) {
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 127) return false;
    }
    return true;
  }

  function convertText(text) {
    if (!text) return text;
    // 純 ASCII 文字節點不做任何轉換
    if (isAsciiOnly(text)) return text;

    if (text.length <= MAX_TEXT_LENGTH) {
      return convertTextChunk(text);
    }

    // 長文字分段處理，避免單一節點過大造成阻塞
    const chunks = splitTextIntoChunks(text, MAX_TEXT_LENGTH);
    return chunks.map(chunk => convertTextChunk(chunk)).join('');
  }

  // ===== 批次處理節點 =====
  function processNodesBatched(nodes) {
    let index = 0;
    
    function processBatch() {
      const batch = nodes.slice(index, index + BATCH_SIZE);
      index += BATCH_SIZE;
      
      batch.forEach(node => processNode(node));
      
      if (index < nodes.length) {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(processBatch);
        } else {
          setTimeout(processBatch, 0);
        }
      }
    }
    
    processBatch();
  }

  // ===== 處理單一節點 =====
  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const original = node.nodeValue;
      if (!original || !original.trim()) return;
      if (isEditableNode(node)) return; // 輸入區文字節點保護
      
      const converted = convertText(original);
      if (converted !== original) {
        node.nodeValue = converted;
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (SKIP_TAGS.has(node.tagName)) return;
      
      // 檢查是否包含 Shadow DOM
      if (node.shadowRoot) {
        processNode(node.shadowRoot);
      }
    }

    // 使用 TreeWalker 更高效地遍歷（過濾 SKIP_TAGS 防止修改 script/style 內容）
    const walker = document.createTreeWalker(
      node,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(n) {
          const parent = n.parentElement;
          if (parent && SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (isEditableNode(n)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let textNode;
    while (textNode = walker.nextNode()) {
      const original = textNode.nodeValue;
      if (!original || !original.trim()) continue;
      
      const converted = convertText(original);
      if (converted !== original) {
        textNode.nodeValue = converted;
      }
    }
  }

  // ===== 主執行函數 =====
  function run() {
    if (!document.body) return;
    
    // 如果字典尚未就緒，將節點加入等待佇列
    if (!isDictionaryReady) {
      pendingNodes.push(document.body);
      return;
    }
    
    processNode(document.body);
  }

  // ===== 初始化（先檢查 storage 啟用狀態）=====
  chrome.storage.local.get({ translationEnabled: true }, ({ translationEnabled }) => {
    if (!translationEnabled) return; // 停用狀態：不執行轉換也不啟動 observer

    translationActive = true;
    initDictionary();

    // 初次執行
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run);
    } else {
      run();
    }

    // 延遲補跑：應對頁面 JS 在 document_idle 後重新渲染 DOM 的情況（如 NGA 登錄頁）
    [300, 800, 1500, 3000].forEach(delay => {
      setTimeout(() => {
        if (isDictionaryReady && document.body) run();
      }, delay);
    });

    startMutationObserver();
  });

  // 監聽動態內容（防抖動版）
  let pendingMutationNodes = [];
  let debounceTimer = null;
  
  function processMutations() {
    if (pendingMutationNodes.length === 0) return;

    // 如果字典尚未就緒，將節點加入等待佇列
    if (!isDictionaryReady) {
      pendingNodes.push(...pendingMutationNodes);
      pendingMutationNodes = [];
      return;
    }

    // 暫時停止 observer，避免我們修改文字節點後又觸發新的 characterData 突變
    stopMutationObserver();

    try {
      const nodes = pendingMutationNodes;
      pendingMutationNodes = [];

      const textNodes = [];

      nodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          textNodes.push(node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (!SKIP_TAGS.has(node.tagName) && !isEditableNode(node)) {
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
              acceptNode(n) {
                const parent = n.parentElement;
                if (parent && SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
                if (isEditableNode(n)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
              }
            });
            let n;
            while (n = walker.nextNode()) textNodes.push(n);
          }
        }
      });

      function processNodeList(list) {
        list.forEach(node => {
          try {
            const original = node.nodeValue;
            if (original && original.trim()) {
              const converted = convertText(original);
              if (converted !== original) node.nodeValue = converted;
            }
          } catch (err) {
            console.error('Error converting text node:', err);
          }
        });
      }

      // 批次處理
      if (textNodes.length > BATCH_SIZE) {
        let index = 0;
        function processBatch() {
          try {
            const batch = textNodes.slice(index, index + BATCH_SIZE);
            index += BATCH_SIZE;

            processNodeList(batch);

            if (index < textNodes.length) {
              requestAnimationFrame(processBatch);
            } else {
              startMutationObserver();
            }
          } catch (err) {
            console.error('Error in mutation batch:', err);
            startMutationObserver();
          }
        }
        processBatch();
      } else {
        processNodeList(textNodes);
        startMutationObserver();
      }
    } catch (err) {
      console.error('Error processing mutations:', err);
      startMutationObserver();
    }
  }
  
  function debouncedProcess(nodes) {
    pendingMutationNodes.push(...nodes);
    
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    debounceTimer = setTimeout(() => {
      processMutations();
      debounceTimer = null;
    }, THROTTLE_MS);
  }

  let observer = null;
  
  function startMutationObserver() {
    if (!translationActive) return; // 已停用：不得重新啟動（含 processMutations 收尾時的重啟）
    if (observer) return; // 已經啟動

    observer = new MutationObserver((mutations) => {
      const nodesToProcess = [];
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          nodesToProcess.push(node);
          // 若新增節點是元素，檢查是否為彈窗/對話框容器，主動納入全部子孫
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = (node.tagName || '').toUpperCase();
            const role = (node.getAttribute && node.getAttribute('role') || '').toLowerCase();
            const cls = (node.className && typeof node.className === 'string') ? node.className : '';
            const isOverlay = role === 'dialog' || role === 'alertdialog' ||
              /modal|dialog|popup|overlay|lightbox|login/i.test(cls) ||
              /modal|dialog|popup|overlay|lightbox|login/i.test(node.id || '');
            if (isOverlay) {
              nodesToProcess.push(node);
            }
          }
        });
        if (mutation.type === 'characterData' && mutation.target) {
          if (!isEditableNode(mutation.target)) {
            nodesToProcess.push(mutation.target);
          }
        }
      });

      if (nodesToProcess.length > 0) {
        debouncedProcess(nodesToProcess);
      }
    });

    // 優先監聽 documentElement，確保 body 重建時也能捕捉（NGA 等動態重渲染頁面）
    const target = document.documentElement || document.body;
    if (target) {
      observer.observe(target, { childList: true, subtree: true, characterData: true });
    } else {
      // body 尚未存在，等待後重試
      const retryInterval = setInterval(() => {
        const t = document.documentElement || document.body;
        if (t) {
          clearInterval(retryInterval);
          observer.observe(t, { childList: true, subtree: true, characterData: true });
        }
      }, 50);
    }
  }
  
  function stopMutationObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // ===== 即時切換（不重整頁面）=====
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== chrome.runtime.id) return; // 僅接受來自本擴充功能自身的訊息
    if (!msg || msg.type !== 'TOGGLE_TRANSLATION') return;
    if (msg.enabled) {
      // 啟用：掃描整頁並啟動 observer。
      // 若頁面是在停用狀態下載入，字典尚未建立且 pendingNodes 為空，
      // 必須先把 body 排入佇列，字典建好後 processPendingNodes 才會轉換整頁。
      translationActive = true;
      if (!isDictionaryReady) {
        if (document.body) pendingNodes.push(document.body);
        initDictionary();
      } else if (document.body) {
        processNode(document.body);
      }
      startMutationObserver();
    } else {
      // 停用：停止 observer（已轉換的文字維持現狀；若要還原需重整）
      translationActive = false;
      stopMutationObserver();
    }
  });

  // 僅在測試模式下暴露內部函數，避免生產環境洩漏字典資料
  if (typeof window !== 'undefined' && window.__CHINA2TAIWAN_TEST_MODE__ && !window.__china2taiwanTest) {
    window.__china2taiwanTest = {
      convertText,
      convertTextChunk,
      splitTextIntoChunks,
      convertTextWithFallback,
      buildSkipRanges,
      dictMap
    };
  }
})();
