const SQUARE_ANGLES = [45, 90, 120, 135, 180, 225, 270, 315, 360, 540, 720];

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

/**
 * 江恩九方格（Square of Nine）
 *
 * 以当前收盘价为中心，取其平方根，按不同角度增减后再平方，
 * 分别计算向上阻力位和向下支撑位。
 *
 * 公式：
 *   阻力 = (√price + angle/360)²
 *   支撑 = (√price - angle/360)²
 *
 * 当前角度 = (√price 的小数部分) × 360°
 */
function buildSquareOfNine(price) {
  if (!price || price <= 0) {
    return null;
  }

  const sqrtBase = Math.sqrt(price);
  const wholePart = Math.floor(sqrtBase);
  const fractional = sqrtBase - wholePart;
  const currentAngle = round(fractional * 360, 1);

  const resistances = SQUARE_ANGLES.map((angle) => {
    const increment = angle / 360;
    const newSqrt = sqrtBase + increment;
    const newPrice = newSqrt * newSqrt;
    return {
      angle,
      label: `+${angle}°`,
      price: round(newPrice),
      change: round(((newPrice - price) / price) * 100, 2)
    };
  });

  const supports = SQUARE_ANGLES
    .map((angle) => {
      const increment = angle / 360;
      const newSqrt = sqrtBase - increment;
      if (newSqrt <= 0) {
        return null;
      }
      const newPrice = newSqrt * newSqrt;
      return {
        angle,
        label: `-${angle}°`,
        price: round(newPrice),
        change: round(((newPrice - price) / price) * 100, 2)
      };
    })
    .filter(Boolean);

  return {
    basePrice: round(price),
    sqrtBase: round(sqrtBase, 4),
    currentAngle,
    resistances,
    supports,
    nearest: {
      resistance: resistances[0] || null,
      support: supports[0] || null
    }
  };
}

module.exports = { buildSquareOfNine };
