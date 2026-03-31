const toggleWatchlistBtn = document.getElementById('toggleWatchlistBtn');
const watchlistListEl = document.getElementById('watchlistList');
const aiHistoryListEl = document.getElementById('aiHistoryList');

let watchlistItems = [];
let aiHistoryItems = [];
let watchlistBusy = false;

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new Error(text.trim().slice(0, 160) || '服务端返回了不可解析内容。');
  }
}

function getCurrentSymbol() {
  return window.gannApp?.getCurrentSymbol?.() || '';
}

function setToggleWatchlistText() {
  const symbol = getCurrentSymbol();
  const exists = watchlistItems.some((item) => item.symbol === symbol);
  toggleWatchlistBtn.textContent = exists ? '移除自选' : '加入自选';
  toggleWatchlistBtn.disabled = watchlistBusy || !symbol;
}

function renderWatchlist() {
  const currentSymbol = getCurrentSymbol();

  if (!watchlistItems.length) {
    watchlistListEl.className = 'action-list empty-state';
    watchlistListEl.textContent = '暂无自选股。';
    setToggleWatchlistText();
    return;
  }

  watchlistListEl.className = 'action-list';
  watchlistListEl.innerHTML = watchlistItems
    .map(
      (item) => `
        <div class="action-item ${item.symbol === currentSymbol ? 'is-active' : ''}">
          <button type="button" class="action-main" data-symbol="${item.symbol}">
            <span class="action-title">${item.name}</span>
            <span class="action-meta">${item.symbol}.${item.market}</span>
          </button>
          <button type="button" class="action-side" data-remove-symbol="${item.symbol}" aria-label="移除自选">删除</button>
        </div>
      `
    )
    .join('');

  setToggleWatchlistText();
}

function renderAiHistory() {
  if (!aiHistoryItems.length) {
    aiHistoryListEl.className = 'action-list empty-state';
    aiHistoryListEl.textContent = '暂无 AI 分析记录。';
    return;
  }

  aiHistoryListEl.className = 'action-list';
  aiHistoryListEl.innerHTML = aiHistoryItems
    .map(
      (item) => `
        <button type="button" class="history-item" data-record-id="${item.id}">
          <span class="history-head">
            <span class="history-title">${item.name} ${item.symbol}.${item.market}</span>
            <span class="history-date">${new Date(item.generatedAt).toLocaleString('zh-CN')}</span>
          </span>
          <span class="history-meta">${item.model} · ${item.period === 'daily' ? '日线' : item.period === 'weekly' ? '周线' : '月线'}</span>
          <span class="history-excerpt">${item.excerpt}</span>
        </button>
      `
    )
    .join('');
}

async function loadWatchlist() {
  const response = await fetch('/api/watchlist');
  const payload = await readJsonResponse(response);

  if (!payload.ok) {
    throw new Error(payload.message || '加载自选股失败。');
  }

  watchlistItems = payload.items || [];
  renderWatchlist();
}

async function loadAiHistory(symbol = getCurrentSymbol()) {
  if (!symbol) {
    aiHistoryItems = [];
    renderAiHistory();
    return;
  }

  const response = await fetch(`/api/ai-reports?symbol=${encodeURIComponent(symbol)}&limit=12`);
  const payload = await readJsonResponse(response);

  if (!payload.ok) {
    throw new Error(payload.message || '加载 AI 记录失败。');
  }

  aiHistoryItems = payload.items || [];
  renderAiHistory();
}

async function addToWatchlist(symbol) {
  const response = await fetch('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol })
  });
  const payload = await readJsonResponse(response);

  if (!payload.ok) {
    throw new Error(payload.message || '加入自选失败。');
  }
}

async function removeFromWatchlist(symbol) {
  const response = await fetch(`/api/watchlist/${encodeURIComponent(symbol)}`, {
    method: 'DELETE'
  });
  const payload = await readJsonResponse(response);

  if (!payload.ok) {
    throw new Error(payload.message || '移除自选失败。');
  }
}

async function toggleCurrentWatchlist() {
  const symbol = getCurrentSymbol();
  if (!symbol || watchlistBusy) {
    return;
  }

  const exists = watchlistItems.some((item) => item.symbol === symbol);
  watchlistBusy = true;
  setToggleWatchlistText();

  try {
    if (exists) {
      await removeFromWatchlist(symbol);
    } else {
      await addToWatchlist(symbol);
    }

    await loadWatchlist();
  } catch (error) {
    toggleWatchlistBtn.textContent = error.message;
  } finally {
    watchlistBusy = false;
    setToggleWatchlistText();
  }
}

async function openAiHistoryRecord(recordId) {
  const response = await fetch(`/api/ai-reports/${encodeURIComponent(recordId)}`);
  const payload = await readJsonResponse(response);

  if (!payload.ok) {
    throw new Error(payload.message || '读取 AI 记录失败。');
  }

  window.gannApp?.showStoredAiReport?.(payload.record);
}

function attachPersistenceEvents() {
  toggleWatchlistBtn.addEventListener('click', () => {
    toggleCurrentWatchlist().catch((error) => {
      toggleWatchlistBtn.textContent = error.message;
    });
  });

  watchlistListEl.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('[data-remove-symbol]');
    if (removeBtn) {
      removeFromWatchlist(removeBtn.dataset.removeSymbol)
        .then(loadWatchlist)
        .catch((error) => {
          toggleWatchlistBtn.textContent = error.message;
        });
      return;
    }

    const mainBtn = event.target.closest('[data-symbol]');
    if (!mainBtn) {
      return;
    }

    window.gannApp
      ?.loadSymbol?.(mainBtn.dataset.symbol)
      ?.catch?.((error) => {
        console.error(error);
      });
  });

  aiHistoryListEl.addEventListener('click', (event) => {
    const recordBtn = event.target.closest('[data-record-id]');
    if (!recordBtn) {
      return;
    }

    openAiHistoryRecord(recordBtn.dataset.recordId).catch((error) => {
      console.error(error);
    });
  });

  document.addEventListener('gann:context-updated', (event) => {
    renderWatchlist();
    loadAiHistory(event.detail?.symbol).catch((error) => {
      console.error(error);
    });
  });

  document.addEventListener('gann:ai-report-saved', (event) => {
    loadAiHistory(event.detail?.symbol).catch((error) => {
      console.error(error);
    });
  });
}

async function bootPersistence() {
  attachPersistenceEvents();
  await loadWatchlist();
  await loadAiHistory();
  setToggleWatchlistText();
}

bootPersistence().catch((error) => {
  console.error(error);
  toggleWatchlistBtn.textContent = '自选股异常';
});
