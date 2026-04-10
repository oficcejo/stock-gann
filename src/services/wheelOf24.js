const CARDINAL_ANGLES = [0, 90, 180, 270];
const ORDINAL_ANGLES = [45, 135, 225, 315];
const TIME_INTERVALS = [45, 90, 120, 144, 180, 270, 360];

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

/**
 * 计算给定轮盘环数和角度下的价格值。
 *
 * 环数 ring 对应 √price 的整数部分，角度 angleDeg 对应小数部分：
 *   price = (ring + angleDeg/360)²
 */
function priceAtAngle(ring, angleDeg) {
  const val = ring + angleDeg / 360;
  return val * val;
}

/**
 * 找出在某一特定角度上、距离当前价格最近的若干价位。
 *
 * 遍历 baseRing-2 到 baseRing+3 的多个环数，
 * 计算每个环在 targetAngle 角度上的价格，按距离排序后返回。
 */
function findNearestPricesAtAngle(price, targetAngle) {
  const sqrtBase = Math.sqrt(price);
  const baseRing = Math.floor(sqrtBase);
  const results = [];

  for (let ring = Math.max(1, baseRing - 2); ring <= baseRing + 3; ring++) {
    const p = priceAtAngle(ring, targetAngle);
    if (p > 0) {
      results.push({
        angle: targetAngle,
        ring,
        price: round(p),
        change: round(((p - price) / price) * 100, 2),
        direction: p >= price ? 'resistance' : 'support'
      });
    }
  }

  results.sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
  return results;
}

/**
 * 构建十字线或 × 线上的关键价位。
 *
 * 对给定的一组角度，分别取最近的支撑和阻力位。
 */
function buildCrossLevels(price, angles) {
  const levels = [];

  angles.forEach((angle) => {
    const nearest = findNearestPricesAtAngle(price, angle);
    const support = nearest.find((item) => item.direction === 'support');
    const resistance = nearest.find((item) => item.direction === 'resistance');
    if (support) levels.push(support);
    if (resistance) levels.push(resistance);
  });

  return levels.sort((a, b) => a.price - b.price);
}

/**
 * 从最后一根 K 线日期开始，按江恩关键时间间隔向未来投影。
 */
function buildTimeForecast(lastDate) {
  const baseTimestamp = new Date(`${lastDate}T00:00:00+08:00`).getTime();
  if (!Number.isFinite(baseTimestamp)) {
    return [];
  }

  return TIME_INTERVALS.map((days) => {
    const target = new Date(baseTimestamp + days * 86400000);
    return {
      days,
      label: `+${days}天`,
      date: target.toISOString().slice(0, 10)
    };
  });
}

/**
 * 江恩轮中轮（Wheel of 24）
 *
 * 将 360° 分为 24 个扇区（每扇区 15°），
 * 当前价格映射到轮盘角度后，计算十字线（Cardinal Cross: 0°/90°/180°/270°）
 * 和 × 线（Ordinal Cross: 45°/135°/225°/315°）上距离当前价格最近的支撑/阻力价位。
 *
 * 同时输出时间预测：从最后交易日起，按 45/90/120/144/180/270/360 天向前推算关键时间窗口。
 */
function buildWheelOf24(price, lastDate) {
  if (!price || price <= 0) {
    return null;
  }

  const sqrtBase = Math.sqrt(price);
  const fractional = sqrtBase - Math.floor(sqrtBase);
  const wheelAngle = round((fractional * 360) % 360, 1);
  const sector = Math.min(Math.floor(wheelAngle / 15) + 1, 24);

  const cardinalLevels = buildCrossLevels(price, CARDINAL_ANGLES);
  const ordinalLevels = buildCrossLevels(price, ORDINAL_ANGLES);
  const timeForecast = buildTimeForecast(lastDate);

  return {
    basePrice: round(price),
    wheelAngle,
    sector,
    sectorRange: `${(sector - 1) * 15}\u00b0\u2013${sector * 15}\u00b0`,
    cardinalLevels,
    ordinalLevels,
    timeForecast
  };
}

module.exports = { buildWheelOf24 };
