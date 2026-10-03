/**
 * 金额工具（门2：所有钱的计算都从这里走）
 *
 * 约定：
 * 1. 金额一律用元为单位的 Number；
 * 2. 任何来源不明的值先过 num()，脏数据一律当 0，不做字符串拼接；
 * 3. 累加一律过 round2()，避免 0.1 + 0.2 = 0.30000000000000004 显示出来。
 * 下一期若引入「分」为单位，只需改本文件，调用方零改动。
 */

/**
 * 安全转数字
 * @param {*} value
 * @returns {number} 无法转换时返回 0
 */
function num(value) {
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * 保留两位小数
 * @param {number} value
 * @returns {number}
 */
function round2(value) {
  return Math.round(num(value) * 100) / 100
}

/**
 * 求和：对列表每一项取值后累加
 * @param {Array} list
 * @param {function(*):number} [getter] 默认为 identity
 * @returns {number}
 */
function sum(list, getter) {
  const pick = typeof getter === 'function' ? getter : (item) => item
  return round2((list || []).reduce((acc, item) => acc + num(pick(item)), 0))
}

module.exports = {
  num,
  round2,
  sum
}
