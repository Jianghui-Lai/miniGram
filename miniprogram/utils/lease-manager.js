/**
 * 租期管理核心工具
 *
 * 职责边界（重构后收敛为两件事）：
 * 1. 整体租期状态（出租中 / 即将出租 / 未租）
 * 2. 收租提醒（提醒日计算、是否该提醒）—— 本项目最核心功能，逻辑保持不变
 *
 * 「某个月有没有收租」这类月度状态计算已迁到 utils/rent-status.js，
 * 这里保留同名转发，老调用方与单元测试无需修改。
 */

const dateUtils = require('./date-utils.js')
const rentStatus = require('./rent-status.js')

// 状态常量
const STATUS = {
  RENTING: 'renting',     // 出租中
  UPCOMING: 'upcoming',   // 即将出租
  UNRENTED: 'unrented'    // 未租
}

const STATUS_TEXT = {
  [STATUS.RENTING]: '出租中',
  [STATUS.UPCOMING]: '即将出租',
  [STATUS.UNRENTED]: '未租'
}

/**
 * 获取房产状态（基于租期）
 */
function getPropertyStatus(property) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const hasCompleteLease = property.leaseStart &&
                           property.leaseStart.trim() !== '' &&
                           property.leaseEnd &&
                           property.leaseEnd.trim() !== ''

  if (!hasCompleteLease) {
    return STATUS.UNRENTED
  }

  const leaseStart = dateUtils.parseDate(property.leaseStart)
  const leaseEnd = dateUtils.parseDate(property.leaseEnd)
  if (!leaseStart || !leaseEnd) return STATUS.UNRENTED
  leaseEnd.setHours(23, 59, 59, 999)

  if (today < leaseStart) {
    return STATUS.UPCOMING
  }

  if (today > leaseEnd) {
    return STATUS.UNRENTED
  }

  return STATUS.RENTING
}

// ================================================================
// 月度状态：转发到 rent-status，保持对外接口不变
// ================================================================

/**
 * 检查某月是否在租期内
 */
function isActiveInMonth(property, year, month) {
  return rentStatus.isActiveInMonth(property, year, month)
}

/**
 * 获取某月收租状态详情
 */
function getMonthStatusDetail(property, year, month) {
  return rentStatus.getMonthStatusDetail(property, year, month)
}

/**
 * 获取租期内所有应缴月份（跨年）
 * @returns {Array<{year, month, amount, status, date, dotColor, statusText}>}
 */
function getAllDueMonths(property) {
  if (!property?.leaseStart || !property?.leaseEnd) return []

  const start = new Date(property.leaseStart)
  const end = new Date(property.leaseEnd)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return []

  const result = []
  for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
    result.push(...rentStatus.getDueMonthsInYear(property, year))
  }
  return result
}

// ================================================================
// 收租提醒（核心功能，逻辑保持原样）
// ================================================================

/**
 * 计算提醒日期（每月固定日期，取租期开始日的「日」）
 */
function getReminderDate(leaseStart, year, month) {
  const startDate = dateUtils.parseDate(leaseStart)
  if (!startDate) return null
  const dayOfMonth = startDate.getDate()

  let reminderDate = new Date(year, month - 1, dayOfMonth)

  // 如果当月没有这一天，取当月最后一天
  if (reminderDate.getMonth() !== month - 1) {
    reminderDate = new Date(year, month, 0)
  }

  return reminderDate
}

/**
 * 检查本月是否已过提醒日但未交租
 */
function shouldRemind(property, currentYear, currentMonth) {
  if (!property.leaseStart || !property.leaseEnd) {
    return false
  }

  const today = new Date()
  const status = getPropertyStatus(property)

  if (status !== STATUS.RENTING) {
    return false
  }

  const payment = property.paymentHistory?.find(p => p.year === currentYear && p.month === currentMonth)
  if (payment?.status === 'paid') {
    return false
  }

  const reminderDate = getReminderDate(property.leaseStart, currentYear, currentMonth)
  if (!reminderDate) return false

  return today >= reminderDate
}

module.exports = {
  // 常量
  STATUS,
  STATUS_TEXT,

  // 租期状态
  getPropertyStatus,

  // 月度状态（转发 rent-status）
  isActiveInMonth,
  getMonthStatusDetail,
  getAllDueMonths,

  // 收租提醒
  getReminderDate,
  shouldRemind
}
