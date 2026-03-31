const PERIOD_MAP = {
  daily: '101',
  weekly: '102',
  monthly: '103'
};

const ADJUST_MAP = {
  none: '0',
  forward: '1',
  backward: '2'
};

const TDX_PERIOD_MAP = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month'
};

const TDX_BASE_URL = 'http://43.138.33.77:8080';
const TDX_PRICE_SCALE = 1000;

function normalizeSymbol(input) {
  const symbol = String(input || '').trim().replace(/\D/g, '');

  if (!/^\d{6}$/.test(symbol)) {
    throw new Error('A股代码必须是 6 位数字，例如 600519 或 000001。');
  }

  return symbol;
}

function resolveMarket(symbol) {
  return /^(6|9)/.test(symbol) ? 'SH' : 'SZ';
}

function toSecId(symbol) {
  return `${resolveMarket(symbol) === 'SH' ? '1' : '0'}.${symbol}`;
}

function normalizePeriod(period) {
  return Object.keys(PERIOD_MAP).find((key) => key === period) || 'daily';
}

function normalizeAdjusted(adjusted) {
  return Object.keys(ADJUST_MAP).find((key) => key === adjusted) || 'forward';
}

function parseEastMoneyKline(row) {
  const [date, open, close, high, low, volume, amount, amplitude, changePercent, changeAmount, turnoverRate] = row.split(',');

  return {
    date,
    timestamp: Math.floor(new Date(`${date}T00:00:00+08:00`).getTime() / 1000),
    open: Number(open),
    close: Number(close),
    high: Number(high),
    low: Number(low),
    volume: Number(volume),
    amount: Number(amount),
    amplitude: Number(amplitude),
    changePercent: Number(changePercent),
    changeAmount: Number(changeAmount),
    turnoverRate: Number(turnoverRate)
  };
}

function buildCandleFilter(item) {
  return (
    Number.isFinite(item.open) &&
    Number.isFinite(item.high) &&
    Number.isFinite(item.low) &&
    Number.isFinite(item.close) &&
    item.open > 0 &&
    item.high > 0 &&
    item.low > 0 &&
    item.close > 0
  );
}

function parseTdxTime(time) {
  const normalized = String(time || '').replace('Z', '+08:00');
  const date = new Date(normalized);
  const timestamp = Math.floor(date.getTime() / 1000);

  return {
    date: Number.isFinite(timestamp) ? date.toISOString().slice(0, 10) : '',
    timestamp
  };
}

function toScaledPrice(value) {
  return Number(value) / TDX_PRICE_SCALE;
}

function parseTdxKline(item) {
  const { date, timestamp } = parseTdxTime(item.Time);
  const open = toScaledPrice(item.Open);
  const close = toScaledPrice(item.Close);
  const high = toScaledPrice(item.High);
  const low = toScaledPrice(item.Low);
  const last = toScaledPrice(item.Last);
  const changeAmount = Number.isFinite(last) && last !== 0 ? close - last : 0;
  const changePercent = Number.isFinite(last) && last !== 0 ? (changeAmount / last) * 100 : 0;
  const amplitude = low > 0 ? ((high - low) / low) * 100 : 0;

  return {
    date,
    timestamp,
    open,
    close,
    high,
    low,
    volume: Number(item.Volume || 0),
    amount: Number(item.Amount || 0) / TDX_PRICE_SCALE,
    amplitude,
    changePercent,
    changeAmount,
    turnoverRate: 0
  };
}

function buildTdxQuoteDailyCandle(payload) {
  const rawDate = String(payload?.data?.minute?.date || '').trim();
  const quote = payload?.data?.quote;
  const quoteK = quote?.K;

  if (!/^\d{8}$/.test(rawDate) || !quoteK) {
    return null;
  }

  const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
  const timestamp = Math.floor(new Date(`${date}T15:00:00+08:00`).getTime() / 1000);
  const open = toScaledPrice(quoteK.Open);
  const close = toScaledPrice(quoteK.Close);
  const high = toScaledPrice(quoteK.High);
  const low = toScaledPrice(quoteK.Low);
  const last = toScaledPrice(quoteK.Last);
  const changeAmount = Number.isFinite(last) && last !== 0 ? close - last : 0;
  const changePercent = Number.isFinite(last) && last !== 0 ? (changeAmount / last) * 100 : 0;
  const amplitude = low > 0 ? ((high - low) / low) * 100 : 0;

  return {
    date,
    timestamp,
    open,
    close,
    high,
    low,
    volume: Number(quote.TotalHand || 0),
    amount: Number(quote.Amount || 0),
    amplitude,
    changePercent,
    changeAmount,
    turnoverRate: 0
  };
}

function extractLatestTdxDailyCandle(payload) {
  const rows = payload?.data?.kline_day?.List;
  const latestKlineRow = Array.isArray(rows) ? rows[rows.length - 1] : null;
  const latestKlineCandle = latestKlineRow ? parseTdxKline(latestKlineRow) : null;
  const quoteCandle = buildTdxQuoteDailyCandle(payload);

  if (!quoteCandle) {
    return latestKlineCandle;
  }

  if (!latestKlineCandle) {
    return quoteCandle;
  }

  if (quoteCandle.timestamp >= latestKlineCandle.timestamp) {
    return quoteCandle;
  }

  return latestKlineCandle;
}

function mergeCandlesByDate(candles, latestCandle) {
  if (!latestCandle || !buildCandleFilter(latestCandle) || latestCandle.timestamp <= 0) {
    return candles;
  }

  const merged = new Map(candles.map((item) => [item.date, item]));
  merged.set(latestCandle.date, latestCandle);

  return Array.from(merged.values()).sort((left, right) => left.timestamp - right.timestamp);
}

async function fetchEastMoneyHistory(symbol, options = {}) {
  const period = PERIOD_MAP[options.period] || PERIOD_MAP.daily;
  const limit = Math.min(Math.max(Number(options.limit || 320), 60), 1000);
  const adjusted = ADJUST_MAP[options.adjusted] || ADJUST_MAP.forward;

  const url = new URL('https://push2his.eastmoney.com/api/qt/stock/kline/get');
  url.searchParams.set('secid', toSecId(symbol));
  url.searchParams.set('fields1', 'f1,f2,f3,f4,f5,f6');
  url.searchParams.set('fields2', 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61');
  url.searchParams.set('klt', period);
  url.searchParams.set('fqt', adjusted);
  url.searchParams.set('beg', '0');
  url.searchParams.set('end', '20500101');
  url.searchParams.set('lmt', String(limit));

  const response = await fetch(url, {
    headers: {
      Referer: 'https://quote.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    throw new Error(`东方财富行情服务请求失败，HTTP ${response.status}`);
  }

  const payload = await response.json();
  const data = payload?.data;

  if (!data?.klines?.length) {
    throw new Error('东方财富没有返回该股票的历史行情数据。');
  }

  const candles = data.klines.map(parseEastMoneyKline).filter(buildCandleFilter).slice(-limit);

  if (candles.length < 30) {
    throw new Error('东方财富历史数据不足，无法进行有效分析。');
  }

  return {
    source: 'eastmoney',
    security: {
      code: data.code || symbol,
      name: data.name || symbol
    },
    period: normalizePeriod(options.period),
    adjusted: normalizeAdjusted(options.adjusted),
    candles
  };
}

function extractTdxName(payload, symbol) {
  return payload?.data?.Name || payload?.data?.name || payload?.data?.CodeName || symbol;
}

async function fetchTdxStockInfo(symbol) {
  try {
    const response = await fetch(`${TDX_BASE_URL}/api/stock-info?code=${symbol}`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (_error) {
    return null;
  }
}

async function fetchTdxHistory(symbol, options = {}) {
  const period = TDX_PERIOD_MAP[options.period] || TDX_PERIOD_MAP.daily;
  const limit = Math.min(Math.max(Number(options.limit || 320), 60), 1000);
  const response = await fetch(`${TDX_BASE_URL}/api/kline?code=${symbol}&type=${period}`);

  if (!response.ok) {
    throw new Error(`TDX 备用行情服务请求失败，HTTP ${response.status}`);
  }

  const payload = await response.json();
  const rows = payload?.data?.List;

  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('TDX 备用行情服务没有返回该股票的历史数据。');
  }

  const stockInfo = await fetchTdxStockInfo(symbol);
  let candles = rows
    .slice()
    .map(parseTdxKline)
    .filter((item) => buildCandleFilter(item) && item.timestamp > 0)
    .slice(-limit);

  if (period === TDX_PERIOD_MAP.daily) {
    candles = mergeCandlesByDate(candles, extractLatestTdxDailyCandle(stockInfo)).slice(-limit);
  }

  if (candles.length < 30) {
    throw new Error('TDX 备用行情历史数据不足，无法进行有效分析。');
  }

  const name = extractTdxName(stockInfo, symbol);

  return {
    source: 'tdx-api',
    security: {
      code: symbol,
      name
    },
    period: normalizePeriod(options.period),
    adjusted: normalizeAdjusted(options.adjusted),
    candles
  };
}

async function fetchAStockHistory(symbol, options = {}) {
  try {
    return await fetchEastMoneyHistory(symbol, options);
  } catch (primaryError) {
    console.warn(`[marketData] EastMoney failed for ${symbol}: ${primaryError.message}`);

    try {
      return await fetchTdxHistory(symbol, options);
    } catch (fallbackError) {
      throw new Error(`主行情源失败：${primaryError.message}；备用行情源失败：${fallbackError.message}`);
    }
  }
}

module.exports = {
  fetchAStockHistory,
  normalizeSymbol,
  resolveMarket
};
