const { buildSquareOfNine } = require('./squareOfNine');
const { buildWheelOf24 } = require('./wheelOf24');

const DEFAULT_CYCLES = [7, 9, 21, 30, 45, 60, 90, 120, 144, 180];

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function pickPivotLow(candles) {
  return candles.reduce((lowest, candle, index) => {
    if (!lowest || candle.low < lowest.low) {
      return { ...candle, index };
    }
    return lowest;
  }, null);
}

function pickPivotHigh(candles, startIndex = 0) {
  return candles.slice(startIndex).reduce((highest, candle, offset) => {
    const index = startIndex + offset;
    if (!highest || candle.high > highest.high) {
      return { ...candle, index };
    }
    return highest;
  }, null);
}

function buildFanLines(pivotLow, candles) {
  const lastIndex = candles.length - 1;
  const basePriceUnit = Math.max(pivotLow.low * 0.01, 0.02);
  const ratios = [
    { key: '1x8', slope: 0.125 },
    { key: '1x4', slope: 0.25 },
    { key: '1x2', slope: 0.5 },
    { key: '1x1', slope: 1 },
    { key: '2x1', slope: 2 },
    { key: '4x1', slope: 4 }
  ];

  return ratios.map((ratio) => {
    const endIndex = Math.min(lastIndex, pivotLow.index + Math.max(20, Math.floor((lastIndex - pivotLow.index) * 0.95)));
    const bars = endIndex - pivotLow.index;

    return {
      label: ratio.key,
      slope: ratio.slope,
      start: {
        time: pivotLow.timestamp,
        value: round(pivotLow.low)
      },
      end: {
        time: candles[endIndex].timestamp,
        value: round(pivotLow.low + bars * basePriceUnit * ratio.slope)
      }
    };
  });
}

function buildPriceLevels(pivotLow, pivotHigh) {
  const range = pivotHigh.high - pivotLow.low;
  const fractions = [0, 0.125, 0.25, 0.333, 0.5, 0.667, 0.75, 0.875, 1];

  return fractions.map((fraction) => ({
    label: `${round(fraction * 100, 1)}%`,
    value: round(pivotLow.low + range * fraction)
  }));
}

function buildTimeCycles(pivotLow, candles) {
  return DEFAULT_CYCLES
    .filter((cycle) => pivotLow.index + cycle < candles.length)
    .map((cycle) => {
      const anchor = candles[pivotLow.index + cycle];
      return {
        cycle,
        date: anchor.date,
        timestamp: anchor.timestamp,
        close: round(anchor.close)
      };
    });
}

function calculateTrendBias(lastClose, fanLines) {
  const oneByOne = fanLines.find((line) => line.label === '1x1');
  const twoByOne = fanLines.find((line) => line.label === '2x1');
  const lowerHalf = fanLines.find((line) => line.label === '1x2');
  const levels = [oneByOne, twoByOne, lowerHalf].filter(Boolean).map((line) => line.end.value);

  if (!levels.length) {
    return 'neutral';
  }

  if (lastClose > Math.max(...levels)) {
    return 'bullish';
  }

  if (lastClose < Math.min(...levels)) {
    return 'bearish';
  }

  return 'neutral';
}

function buildForecast(candles, pivotLow, pivotHigh, priceLevels, trendBias) {
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const range = pivotHigh.high - pivotLow.low;
  const realizedMove = last.close - pivotLow.low;
  const projectionBase = realizedMove / Math.max(candles.length - 1 - pivotLow.index, 1);
  const directionalFactor = trendBias === 'bullish' ? 1 : trendBias === 'bearish' ? -1 : 0;
  const nextCycles = DEFAULT_CYCLES
    .map((cycle) => ({ cycle, targetIndex: pivotLow.index + cycle }))
    .filter((item) => item.targetIndex >= candles.length)
    .slice(0, 4)
    .map((item) => ({
      cycle: item.cycle,
      barsAway: item.targetIndex - (candles.length - 1)
    }));
  const targets = priceLevels
    .filter((level) => level.value >= last.close * 0.92 && level.value <= last.close * 1.18)
    .slice(0, 4);

  return {
    lastClose: round(last.close),
    lastDate: last.date,
    range: round(range),
    trendBias,
    momentum: round(prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100, 2),
    nextTimeWindows: nextCycles,
    priceTargets: targets.length
      ? targets
      : [
          { label: '50%', value: round(last.close + projectionBase * 5 + directionalFactor * range * 0.125) },
          { label: '75%', value: round(last.close + projectionBase * 10 + directionalFactor * range * 0.25) }
        ]
  };
}

function summarizeSignals(candles, pivotLow, pivotHigh, forecast, priceLevels, timeCycles) {
  const last = candles[candles.length - 1];
  const dominantLevel = priceLevels.reduce((closest, level) => {
    const distance = Math.abs(level.value - last.close);
    if (!closest || distance < closest.distance) {
      return { ...level, distance };
    }
    return closest;
  }, null);
  const nearestCycle = timeCycles.reduce((closest, cycle) => {
    const distance = Math.abs(cycle.timestamp - last.timestamp);
    if (!closest || distance < closest.distance) {
      return { ...cycle, distance };
    }
    return closest;
  }, null);

  return [
    `主枢轴低点位于 ${pivotLow.date}（${round(pivotLow.low)}），主枢轴高点位于 ${pivotHigh.date}（${round(pivotHigh.high)}），中间运行 ${pivotHigh.index - pivotLow.index} 根K线。`,
    `最新收盘价 ${round(last.close)}，最接近的江恩价格分割位是 ${dominantLevel ? `${dominantLevel.label}（${dominantLevel.value}）` : '暂无'}。`,
    nearestCycle
      ? `最近触发的江恩时间窗口是 ${nearestCycle.cycle} 周期，对应日期 ${nearestCycle.date}。`
      : '当前样本内尚未形成有效的江恩时间窗口交汇。',
    `当前趋势偏向${forecast.trendBias === 'bullish' ? '多头' : forecast.trendBias === 'bearish' ? '空头' : '震荡'}，短线动量 ${forecast.momentum}%。`
  ];
}

function buildGannReport(history) {
  const candles = history.candles;
  const pivotLow = pickPivotLow(candles);
  const pivotHigh = pickPivotHigh(candles, pivotLow.index + 1) || pickPivotHigh(candles, 0);

  if (!pivotLow || !pivotHigh || pivotHigh.index <= pivotLow.index) {
    throw new Error('无法识别有效的江恩枢轴点。');
  }

  const fanLines = buildFanLines(pivotLow, candles);
  const priceLevels = buildPriceLevels(pivotLow, pivotHigh);
  const timeCycles = buildTimeCycles(pivotLow, candles);
  const trendBias = calculateTrendBias(candles[candles.length - 1].close, fanLines);
  const forecast = buildForecast(candles, pivotLow, pivotHigh, priceLevels, trendBias);
  const summary = summarizeSignals(candles, pivotLow, pivotHigh, forecast, priceLevels, timeCycles);

  const lastCandle = candles[candles.length - 1];
  const squareOfNine = buildSquareOfNine(lastCandle.close);
  const wheelOf24 = buildWheelOf24(lastCandle.close, lastCandle.date);

  if (squareOfNine && squareOfNine.nearest.resistance && squareOfNine.nearest.support) {
    summary.push(`九方格显示最近上方阻力位 ${squareOfNine.nearest.resistance.price}（${squareOfNine.nearest.resistance.label}），下方支撑位 ${squareOfNine.nearest.support.price}（${squareOfNine.nearest.support.label}），当前角度 ${squareOfNine.currentAngle}°。`);
  }

  if (wheelOf24) {
    summary.push(`轮中轮显示价格位于轮盘 ${wheelOf24.wheelAngle}°（第${wheelOf24.sector}扇区），十字线和×线交叉标注了关键共振价位。`);
  }

  return {
    pivots: {
      low: {
        date: pivotLow.date,
        index: pivotLow.index,
        price: round(pivotLow.low)
      },
      high: {
        date: pivotHigh.date,
        index: pivotHigh.index,
        price: round(pivotHigh.high)
      }
    },
    fanLines,
    priceLevels,
    timeCycles,
    forecast,
    summary,
    squareOfNine,
    wheelOf24
  };
}

module.exports = {
  buildGannReport
};
