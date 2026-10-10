/**
 * 房产数据仓库（门1：全项目唯一数据出口）
 *
 * 规则：
 * - 页面不再碰 wx.getStorage / wx.setStorage，统一走这里；
 * - 所有写操作返回 boolean（写失败返回 false，由调用方 toast），不会出现 await 永不返回；
 * - totalReceivedRent 这类可推导字段，不再落盘，统一在读取时计算。
 *
 * 下一期多租客：properties → leases → tenants / bills / feeRules，
 * 只需在本文件内扩展，调用方零感知。
 */

const storage = require('./storage.js')
const dateUtils = require('./date-utils.js')
const money = require('./money.js')

const KEY = storage.KEYS.PROPERTIES

// ============ 读 ============

/**
 * 读取全部房产
 * @returns {Promise<Array>} 无数据或损坏时返回 []
 */
async function getAll() {
  const list = await storage.read(KEY, [])
  return Array.isArray(list) ? list : []
}

/**
 * 按 id 查找单个房产
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function findById(id) {
  const list = await getAll()
  return list.find(p => p.id === id) || null
}

// ============ 写 ============

/**
 * 新增房产
 * @param {Object} form 页面表单原始数据
 * @returns {Promise<Object|null>} 写入成功返回新房产，失败返回 null
 */
async function create(form) {
  const list = await getAll()
  const now = dateUtils.nowISO()

  const property = {
    id: Date.now(),
    address: String(form.address || '').trim(),
    monthlyRent: money.num(form.monthlyRent),
    propertyFee: money.num(form.propertyFee),
    tenantName: form.tenantName || '',
    tenantPhone: form.tenantPhone || '',
    leaseStart: form.leaseStart || '',
    leaseEnd: form.leaseEnd || '',
    remark: form.remark || '',
    paymentHistory: [],
    propertyFeeHistory: [],
    createdAt: now,
    updatedAt: now
  }

  list.push(property)
  const ok = await storage.write(KEY, list)
  return ok ? property : null
}

/**
 * 更新房产基本信息
 * @param {number} id
 * @param {Object} form
 * @returns {Promise<boolean>}
 */
async function update(id, form) {
  const list = await getAll()
  const index = list.findIndex(p => p.id === id)
  if (index === -1) return false

  const old = list[index]
  // paymentHistory / propertyFeeHistory / id / createdAt 不允许被表单覆盖
  const { paymentHistory, propertyFeeHistory, id: _id, createdAt, ...rest } = form

  list[index] = {
    ...old,
    ...rest,
    id: old.id,
    createdAt: old.createdAt,
    paymentHistory: old.paymentHistory || [],
    propertyFeeHistory: old.propertyFeeHistory || [],
    monthlyRent: form.monthlyRent === undefined ? old.monthlyRent : money.num(form.monthlyRent),
    propertyFee: form.propertyFee === undefined ? money.num(old.propertyFee) : money.num(form.propertyFee),
    updatedAt: dateUtils.nowISO()
  }

  return await storage.write(KEY, list)
}

/**
 * 删除房产
 * @param {number} id
 * @returns {Promise<boolean>}
 */
async function remove(id) {
  const list = await getAll()
  const next = list.filter(p => p.id !== id)
  if (next.length === list.length) return false
  return await storage.write(KEY, next)
}

// ============ 收租 / 撤销 ============

/**
 * 确认收租
 * - 幂等：该月已是 paid 时直接返回 true，不篡改原始金额与日期
 * - amount 恒写入：后续统计以实收为准
 * @param {number} id
 * @param {number} year
 * @param {number} month
 * @param {number} amount
 * @returns {Promise<boolean>}
 */
async function collectRent(id, year, month, amount) {
  const list = await getAll()
  const index = list.findIndex(p => p.id === id)
  if (index === -1) return false

  const property = list[index]
  const history = property.paymentHistory || []
  const today = dateUtils.formatDate(new Date())
  const existingIndex = history.findIndex(p => p.year === year && p.month === month)

  if (existingIndex !== -1) {
    if (history[existingIndex].status === 'paid') {
      return true // 已收款，重复点击不改变历史
    }
    history[existingIndex].status = 'paid'
    history[existingIndex].date = today
    history[existingIndex].amount = money.num(amount)
  } else {
    history.push({
      year,
      month,
      status: 'paid',
      date: today,
      amount: money.num(amount)
    })
  }

  property.paymentHistory = history
  property.updatedAt = dateUtils.nowISO()

  return await storage.write(KEY, list)
}

/**
 * 撤销收租（回到未收，不等于删除该月记录）
 * @param {number} id
 * @param {number} year
 * @param {number} month
 * @returns {Promise<boolean>}
 */
async function cancelRent(id, year, month) {
  const list = await getAll()
  const index = list.findIndex(p => p.id === id)
  if (index === -1) return false

  const history = list[index].paymentHistory || []
  const paymentIndex = history.findIndex(p => p.year === year && p.month === month)
  if (paymentIndex === -1) return false

  history[paymentIndex].status = 'unpaid'
  history[paymentIndex].date = null
  history[paymentIndex].amount = 0

  list[index].paymentHistory = history
  list[index].updatedAt = dateUtils.nowISO()

  return await storage.write(KEY, list)
}

// ============ 物业费 / 撤销 ============

/**
 * 标记当月物业费已缴
 * - 幂等：该月已是 paid 时直接返回 true，不篡改原始金额与日期
 * - amount 不传时按该房产的月物业费入账
 * @param {number} id
 * @param {number} year
 * @param {number} month
 * @param {number} [amount]
 * @returns {Promise<boolean>}
 */
async function collectPropertyFee(id, year, month, amount) {
  const list = await getAll()
  const index = list.findIndex(p => p.id === id)
  if (index === -1) return false

  const property = list[index]
  const history = property.propertyFeeHistory || []
  const today = dateUtils.formatDate(new Date())
  const feeAmount = amount === undefined ? money.num(property.propertyFee) : money.num(amount)
  const existingIndex = history.findIndex(p => p.year === year && p.month === month)

  if (existingIndex !== -1) {
    if (history[existingIndex].status === 'paid') {
      return true // 已缴，重复点击不改变历史
    }
    history[existingIndex].status = 'paid'
    history[existingIndex].date = today
    history[existingIndex].amount = feeAmount
  } else {
    history.push({
      year,
      month,
      status: 'paid',
      date: today,
      amount: feeAmount
    })
  }

  property.propertyFeeHistory = history
  property.updatedAt = dateUtils.nowISO()

  return await storage.write(KEY, list)
}

/**
 * 撤销当月物业费（回到未缴）
 * @param {number} id
 * @param {number} year
 * @param {number} month
 * @returns {Promise<boolean>}
 */
async function cancelPropertyFee(id, year, month) {
  const list = await getAll()
  const index = list.findIndex(p => p.id === id)
  if (index === -1) return false

  const history = list[index].propertyFeeHistory || []
  const recordIndex = history.findIndex(p => p.year === year && p.month === month)
  if (recordIndex === -1) return false

  history[recordIndex].status = 'unpaid'
  history[recordIndex].date = null
  history[recordIndex].amount = 0

  list[index].propertyFeeHistory = history
  list[index].updatedAt = dateUtils.nowISO()

  return await storage.write(KEY, list)
}

// ============ 派生计算 ============

/**
 * 累计已收租金（实时算，不再落盘）
 * 只统计有明确金额的记录，不用当前月租回填历史，避免涨价后历史被改写
 * @param {Object} property
 * @returns {number}
 */
function calcTotalReceived(property) {
  return money.sum(
    (property?.paymentHistory || []).filter(p => p.status === 'paid'),
    p => p.amount
  )
}

module.exports = {
  getAll,
  findById,
  create,
  update,
  remove,
  collectRent,
  cancelRent,
  collectPropertyFee,
  cancelPropertyFee,
  calcTotalReceived
}
