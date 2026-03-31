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

function parseKline(row) {
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

async function fetchAStockHistory(symbol, options = {}) {
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
    throw new Error(`行情服务请求失败，HTTP ${response.status}`);
  }

  const payload = await response.json();
  const data = payload?.data;

  if (!data?.klines?.length) {
    throw new Error('没有拿到该股票的历史行情数据。');
  }

  const candles = data.klines
    .map(parseKline)
    .filter(
      (item) =>
        Number.isFinite(item.open) &&
        Number.isFinite(item.high) &&
        Number.isFinite(item.low) &&
        Number.isFinite(item.close) &&
        item.open > 0 &&
        item.high > 0 &&
        item.low > 0 &&
        item.close > 0
    )
    .slice(-limit);

  if (candles.length < 30) {
    throw new Error('历史数据不足，无法进行有效分析。');
  }

  return {
    security: {
      code: data.code || symbol,
      name: data.name || symbol
    },
    period: Object.keys(PERIOD_MAP).find((key) => PERIOD_MAP[key] === period) || 'daily',
    adjusted: Object.keys(ADJUST_MAP).find((key) => ADJUST_MAP[key] === adjusted) || 'forward',
    candles
  };
}

module.exports = {
  fetchAStockHistory,
  normalizeSymbol,
  resolveMarket
};
