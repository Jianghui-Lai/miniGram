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
 * 注意：此函数保留用于兼容，建议逐步迁移到 getAllDueMonths
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

// ================================================================
// 核心函数：实时计算租金状态（不依赖存储完整性）
// ================================================================

/**
 * 获取某个月份的租金状态（实时计算）
 * @param {Object} property - 房产对象
 * @param {number} year - 年份
 * @param {number} month - 月份 (1-12)
 * @returns {string} 'paid' | 'overdue' | 'unpaid' | 'not_active'
 */
function getMonthStatus(property, year, month) {
  // 先检查该月是否在租期内
  if (!isActiveInMonth(property, year, month)) {
    return 'not_active'
  }
  
  // 查找已收记录
  const paidRecord = (property.paymentHistory || []).find(
    p => p.year === year && p.month === month && p.status === 'paid'
  )
  
  if (paidRecord) {
    return 'paid'
  }
  
  // 未支付：判断是否逾期（当前月份 > 该月）
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return 'overdue'
  }
  
  return 'unpaid'
}

/**
 * 获取房产的月度状态详情（实时计算）
 * @param {Object} property - 房产对象
 * @param {number} year - 年份
 * @param {number} month - 月份 (1-12)
 * @returns {Object} { status, text, color, payment }
 */
function getMonthStatusDetail(property, year, month) {
  const status = getMonthStatus(property, year, month)
  const paidRecord = (property.paymentHistory || []).find(
    p => p.year === year && p.month === month && p.status === 'paid'
  )
  
  const statusMap = {
    'paid': { text: '已收租', color: 'green' },
    'overdue': { text: '欠租', color: 'red' },
    'unpaid': { text: '待收租', color: 'gray' },
    'not_active': { text: '未出租', color: 'gray' }
  }
  
  return {
    status,
    ...statusMap[status],
    payment: paidRecord || null
  }
}

/**
 * 获取租期内所有应缴月份列表（实时计算）
 * @param {Object} property - 房产对象
 * @returns {Array} 月份数组 [{ year, month, status, amount, date }]
 */
function getAllDueMonths(property) {
  const result = []
  
  if (!property.leaseStart || !property.leaseStart.trim() || 
      !property.leaseEnd || !property.leaseEnd.trim()) {
    return result
  }
  
  const start = new Date(property.leaseStart)
  const end = new Date(property.leaseEnd)
  const monthlyRent = property.monthlyRent || 0
  
  // 构建已收记录的快速查找表
  const paidMap = {}
  ;(property.paymentHistory || []).forEach(p => {
    if (p.status === 'paid') {
      paidMap[`${p.year}-${p.month}`] = p
    }
  })
  
  // 遍历租期每个月
  let year = start.getFullYear()
  let month = start.getMonth() + 1
  const endYear = end.getFullYear()
  const endMonth = end.getMonth() + 1
  
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const key = `${year}-${month}`
    const paidRecord = paidMap[key]
    
    result.push({
      year,
      month,
      amount: paidRecord?.amount || monthlyRent,
      status: paidRecord ? 'paid' : 'unpaid',
      date: paidRecord?.date || null
    })
    
    month++
    if (month > 12) {
      month = 1
      year++
    }
  }
  
  return result
}

// ================================================================
// 导出
// ================================================================

module.exports = {
  // 常量
  STATUS,
  STATUS_TEXT,
  
  // 租期判断
  getPropertyStatus,
  isActiveInMonth,
  getRentForMonth,
  
  // 提醒
  getReminderDate,
  shouldRemind,
  
  // 兼容旧代码（建议逐步迁移到 getAllDueMonths）
  getMonthlyPaymentStatus,
  
  // 核心实时计算函数
  getMonthStatus,
  getMonthStatusDetail,
  getAllDueMonths
}