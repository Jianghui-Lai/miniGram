/**
 * 租期管理核心工具
 */

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
  
  const leaseStart = new Date(property.leaseStart)
  const leaseEnd = new Date(property.leaseEnd)
  leaseEnd.setHours(23, 59, 59, 999)
  
  if (today < leaseStart) {
    return STATUS.UPCOMING
  }
  
  if (today > leaseEnd) {
    return STATUS.UNRENTED
  }
  
  return STATUS.RENTING
}

/**
 * 检查房产是否在某月处于出租状态
 */
function isActiveInMonth(property, year, month) {
  if (!property.leaseStart || !property.leaseEnd) {
    return false
  }
  
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0, 23, 59, 59)
  
  const leaseStart = new Date(property.leaseStart)
  const leaseEnd = new Date(property.leaseEnd)
  leaseEnd.setHours(23, 59, 59, 999)
  
  return leaseStart <= monthEnd && leaseEnd >= monthStart
}

/**
 * 获取某月的应收租金
 */
function getRentForMonth(property, year, month) {
  if (!isActiveInMonth(property, year, month)) {
    return 0
  }
  return property.monthlyRent || 0
}

/**
 * 获取房产的月度交租状态（用于年历）
 */
function getMonthlyPaymentStatus(property, year) {
  const months = []
  for (let month = 1; month <= 12; month++) {
    const payment = property.paymentHistory?.find(p => p.year === year && p.month === month)
    months.push({
      month,
      isPaid: payment ? payment.status === 'paid' : false,
      date: payment?.date || null
    })
  }
  return months
}

/**
 * 计算提醒日期（每月固定日期）
 */
function getReminderDate(leaseStart, year, month) {
  const startDate = new Date(leaseStart)
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
  
  return today >= reminderDate
}

module.exports = {
  STATUS,
  STATUS_TEXT,
  getPropertyStatus,
  isActiveInMonth,
  getRentForMonth,
  getMonthlyPaymentStatus,
  getReminderDate,
  shouldRemind
}