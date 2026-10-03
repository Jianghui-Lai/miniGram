/**
 * 租金状态计算（纯函数，不碰存储、不碰 wx API）
 *
 * 门3：入参只认「一个出租单元」的最小字段 { leaseStart, leaseEnd, paymentHistory, monthlyRent }，
 *      今天是「一套房一个合同」，下一期换成「一条 lease」时本文件零改动。
 *
 * 门4（方案A）：
 *      text / color 保留四态：已收租 / 欠租 / 待收租 / 未出租（红色警告与提醒功能依赖它）
 *      dotColor 只有两色：green（收齐）/ gray（未收齐）——日历圆点只回答「收没收齐」
 */

const dateUtils = require('./date-utils.js')
const money = require('./money.js')

// 月度收租状态
const STATUS = {
  PAID: 'paid',           // 已收租
  OVERDUE: 'overdue',     // 欠租（月份已过去但未收）
  UNPAID: 'unpaid',       // 待收租（还在这月或未来）
  NOT_ACTIVE: 'not_active' // 该月不在租期内
}

// 四态文案与颜色（给文字/统计用）
const STATUS_MAP = {
  [STATUS.PAID]: { text: '已收租', color: 'green' },
  [STATUS.OVERDUE]: { text: '欠租', color: 'red' },
  [STATUS.UNPAID]: { text: '待收租', color: 'gray' },
  [STATUS.NOT_ACTIVE]: { text: '未出租', color: 'gray' }
}

// 圆点只有两色（收齐 / 未收齐）
const DOT_MAP = {
  [STATUS.PAID]: 'green',
  [STATUS.OVERDUE]: 'gray',
  [STATUS.UNPAID]: 'gray',
  [STATUS.NOT_ACTIVE]: 'gray'
}

function hasCompleteLease(unit) {
  const start = unit?.leaseStart
  const end = unit?.leaseEnd
  return !!start && String(start).trim() !== '' && !!end && String(end).trim() !== ''
}

/**
 * 该月是否在租期内
 * @param {{leaseStart: string, leaseEnd: string}} unit
 * @param {number} year
 * @param {number} month 1-12
 * @returns {boolean}
 */
function isActiveInMonth(unit, year, month) {
  if (!hasCompleteLease(unit)) return false

  const { start: monthStart, end: monthEnd } = dateUtils.monthRange(year, month)

  const leaseStart = dateUtils.parseDate(unit.leaseStart)
  const leaseEnd = dateUtils.parseDate(unit.leaseEnd)
  if (!leaseStart || !leaseEnd) return false
  leaseEnd.setHours(23, 59, 59, 999)

  return leaseStart <= monthEnd && leaseEnd >= monthStart
}

/**
 * 找到某月的已收记录
 * @returns {Object|null}
 */
function findPaidRecord(unit, year, month) {
  return (unit?.paymentHistory || []).find(
    p => p.year === year && p.month === month && p.status === STATUS.PAID
  ) || null
}

/**
 * 某月的实收金额（未收为 0）
 * @returns {number}
 */
function getPaidAmount(unit, year, month) {
  const record = findPaidRecord(unit, year, month)
  return record ? money.num(record.amount) : 0
}

/**
 * 计算某月的收租状态
 * @param {Object} unit { leaseStart, leaseEnd, paymentHistory }
 * @param {number} year
 * @param {number} month
 * @returns {string} paid | overdue | unpaid | not_active
 */
function getMonthStatus(unit, year, month) {
  if (!isActiveInMonth(unit, year, month)) return STATUS.NOT_ACTIVE
  if (findPaidRecord(unit, year, month)) return STATUS.PAID

  const { year: nowYear, month: nowMonth } = dateUtils.currentYearMonth()
  if (year < nowYear || (year === nowYear && month < nowMonth)) return STATUS.OVERDUE

  return STATUS.UNPAID
}

/**
 * 某月状态详情（给页面直接用）
 * @returns {{status: string, text: string, color: string, dotColor: string, payment: Object|null}}
 */
function getMonthStatusDetail(unit, year, month) {
  const status = getMonthStatus(unit, year, month)
  return {
    status,
    ...STATUS_MAP[status],
    dotColor: DOT_MAP[status],
    payment: findPaidRecord(unit, year, month)
  }
}

/**
 * 某一自然年内、处于租期里的所有月份
 * @param {Object} unit { leaseStart, leaseEnd, paymentHistory, monthlyRent }
 * @param {number} year
 * @returns {Array<{year:number, month:number, amount:number, status:string, date:string|null, dotColor:string, statusText:string}>}
 */
function getDueMonthsInYear(unit, year) {
  const result = []
  if (!hasCompleteLease(unit)) return result

  const monthlyRent = money.num(unit.monthlyRent)

  for (let month = 1; month <= 12; month++) {
    if (!isActiveInMonth(unit, year, month)) continue

    const detail = getMonthStatusDetail(unit, year, month)
    result.push({
      year,
      month,
      amount: detail.payment ? money.num(detail.payment.amount) : monthlyRent,
      status: detail.status,
      dotColor: detail.dotColor,
      statusText: detail.text,
      date: detail.payment?.date || null
    })
  }

  return result
}

module.exports = {
  STATUS,
  STATUS_MAP,
  DOT_MAP,
  isActiveInMonth,
  findPaidRecord,
  getPaidAmount,
  getMonthStatus,
  getMonthStatusDetail,
  getDueMonthsInYear
}
