/**
 * 日期工具（统一时区/格式出入口）
 *
 * 约定：
 * 1. 对外日期字符串统一使用 YYYY-MM-DD（补零），例如 2024-06-15。
 * 2. updatedAt / createdAt 统一使用 nowISO()（ISO 字符串），
 *    不再混用 updatedAt = "2024-6-15" 这种本地格式。
 */

/**
 * 两位数补零
 */
function pad2(n) {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * 今天零点（本地时区）
 * @returns {Date}
 */
function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * 格式化为 YYYY-MM-DD
 * @param {Date|string} date
 * @returns {string}
 */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * 按「本地时区」解析 YYYY-MM-DD
 *
 * 为什么不用 new Date('2024-06-15')：
 *   它会按 UTC 零点解析，在中国（UTC+8）落地为 6/15 08:00，
 *   在美洲（UTC-7）落地为 6/14 17:00 —— 同一份数据在两个时区算出租期边界会差一天，
 *   导致「今天生效的租约」被判成未生效、提醒日晚一天。
 * @param {string|Date} value
 * @returns {Date|null} 本地零点；无法解析返回 null
 */
function parseDate(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }
  const str = String(value === undefined || value === null ? '' : value).trim()
  const matched = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str)
  if (matched) {
    return new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]))
  }
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

/**
 * 当前时刻 ISO 字符串（给 createdAt / updatedAt 用）
 * @returns {string}
 */
function nowISO() {
  return new Date().toISOString()
}

/**
 * 当前年/月
 * @returns {{year: number, month: number}} month 为 1-12
 */
function currentYearMonth() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * 「2024年6月」这种展示文本
 * @param {number} year
 * @param {number} month
 * @returns {string}
 */
function monthLabel(year, month) {
  return `${year}年${month}月`
}

/**
 * 某月的起止时刻
 * @param {number} year
 * @param {number} month 1-12
 * @returns {{start: Date, end: Date}} end 为该月最后一天 23:59:59.999
 */
function monthRange(year, month) {
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 0, 23, 59, 59, 999)
  }
}

module.exports = {
  pad2,
  today,
  parseDate,
  formatDate,
  nowISO,
  currentYearMonth,
  monthLabel,
  monthRange
}
