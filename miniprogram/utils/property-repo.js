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
const feeStatus = require('./fee-status.js')

const KEY = storage.KEYS.PROPERTIES

// 各类月度历史字段：create 初始化、update 保护、写入定位都从这里取
// 下一期再加一类费用（如燃气费），只改这一处 + fee-status.js 的 FEE_DEFS
const HISTORY_FIELDS = [
  'paymentHistory',
  'propertyFeeHistory',
  'waterFeeHistory',
  'electricFeeHistory'
]

/** 一套空的月度历史（新增房产时用） */
function emptyHistories() {
  const result = {}
  HISTORY_FIELDS.forEach(field => { result[field] = [] })
  return result
}

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
    ...emptyHistories(),
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
  const next = { ...old, ...form }

  // 各类历史 / id / createdAt 不允许被表单覆盖
  next.id = old.id
  next.createdAt = old.createdAt
  HISTORY_FIELDS.forEach(field => { next[field] = old[field] || [] })

  next.monthlyRent = form.monthlyRent === undefined ? old.monthlyRent : money.num(form.monthlyRent)
  next.propertyFee = form.propertyFee === undefined ? money.num(old.propertyFee) : money.num(form.propertyFee)
  next.updatedAt = dateUtils.nowISO()

  list[index] = next

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

// ============ 月度记录（收租 / 各类费用）通用写入 ============
//
// 收租和三费都是「某房产某月一条记录」，写入骨架完全一样：
// 取房产 → 定位当月记录 → 改 → 落盘。差异只有「历史字段名」和「怎么改」。
// 下面用一个内核 + 两个语义动作（markPaid / markUnpaid）表达，
// 每类费用只需声明自己的字段与金额来源。

// mutate 的返回约定：
//   false       → 写不了（如「无记录可撤」），对外返回 false
//   UNCHANGED   → 无需落盘（幂等），对外返回 true
//   对象        → 作为新记录追加后落盘
//   其它        → 已就地改完，落盘
const UNCHANGED = 'unchanged'

/**
 * 通用月度记录写入
 * @param {number} id
 * @param {string} field 历史字段名
 * @param {number} year
 * @param {number} month
 * @param {function({property:Object, history:Array, index:number}):boolean|string|Object} mutate
 * @returns {Promise<boolean>}
 */
async function writeMonthlyRecord(id, field, year, month, mutate) {
  const list = await getAll()
  const index = list.findIndex(p => p.id === id)
  if (index === -1) return false

  const property = list[index]
  const history = Array.isArray(property[field]) ? property[field] : []
  const recordIndex = history.findIndex(p => p.year === year && p.month === month)

  const result = mutate({ property, history, index: recordIndex })
  if (result === false) return false
  if (result === UNCHANGED) return true
  if (result && typeof result === 'object') history.push(result)

  property[field] = history
  property.updatedAt = dateUtils.nowISO()

  return await storage.write(KEY, list)
}

/**
 * 标记当月已收 / 已缴
 * - 幂等：该月已是 paid 时直接返回 true，不篡改原始金额与日期
 * - amount 不传时用 defaultAmount 取（房租无默认，物业费取设置值，水 / 电取当月应收）
 * @param {number} id
 * @param {string} field
 * @param {number} year
 * @param {number} month
 * @param {number} [amount]
 * @param {object} [options]
 * @param {function(property, year, month):number} [options.defaultAmount]
 * @param {function(number):Object} [options.extraFields] 额外字段（水 / 电要记 dueAmount）
 * @returns {Promise<boolean>}
 */
async function markPaid(id, field, year, month, amount, options = {}) {
  const today = dateUtils.formatDate(new Date())

  return writeMonthlyRecord(id, field, year, month, ({ property, history, index }) => {
    const value = amount === undefined
      ? money.num(options.defaultAmount ? options.defaultAmount(property, year, month) : 0)
      : money.num(amount)
    const extra = options.extraFields ? options.extraFields(value) : null

    if (index === -1) {
      return { year, month, status: 'paid', date: today, amount: value, ...extra }
    }
    if (history[index].status === 'paid') return UNCHANGED // 已收 / 已缴，重复点击不改历史

    Object.assign(history[index], { status: 'paid', date: today, amount: value }, extra)
    return true
  })
}

/**
 * 撤销当月（回到未收 / 未缴，不删除该月记录）
 * 水 / 电的 dueAmount 不动，撤销后直接再点就能重新付款
 * @param {number} id
 * @param {string} field
 * @param {number} year
 * @param {number} month
 * @returns {Promise<boolean>}
 */
async function markUnpaid(id, field, year, month) {
  return writeMonthlyRecord(id, field, year, month, ({ history, index }) => {
    if (index === -1) return false
    Object.assign(history[index], { status: 'unpaid', date: null, amount: 0 })
    return true
  })
}

// ---- 收租 ----

const RENT_FIELD = 'paymentHistory'

async function collectRent(id, year, month, amount) {
  return markPaid(id, RENT_FIELD, year, month, amount)
}

async function cancelRent(id, year, month) {
  return markUnpaid(id, RENT_FIELD, year, month)
}

// ---- 费用：物业费 / 水费 / 电费 ----

/** 某类费用落在哪个历史字段上（未知类型一律当物业费） */
function feeField(type) {
  return feeStatus.getFeeDef(type).historyField
}

async function collectFee(id, type, year, month, amount) {
  const def = feeStatus.getFeeDef(type)

  return markPaid(id, def.historyField, year, month, amount, {
    defaultAmount: (property, y, m) => feeStatus.getMonthlyDue(property, y, m, type),
    // 水 / 电没有房产级金额，当月应收随实收一起记下
    extraFields: def.amountField ? null : (value) => ({ dueAmount: value })
  })
}

async function cancelFee(id, type, year, month) {
  return markUnpaid(id, feeField(type), year, month)
}

/**
 * 录入当月应收金额（只写 dueAmount，不动缴纳状态）
 * 水费 / 电费这类「每月金额不固定」的费用专用：
 * 未设置 → 录入金额 → 变成「未缴」，之后再点确认付款
 * @param {number} id
 * @param {string} type water | electric
 * @param {number} year
 * @param {number} month
 * @param {number} amount 当月应收
 * @returns {Promise<boolean>}
 */
async function setMonthlyFee(id, type, year, month, amount) {
  const dueAmount = money.num(amount)

  return writeMonthlyRecord(id, feeField(type), year, month, ({ history, index }) => {
    if (index === -1) {
      return { year, month, status: 'unpaid', dueAmount, amount: 0, date: null }
    }
    history[index].dueAmount = dueAmount
    return true
  })
}

// ---- 物业费（保持原签名） ----

async function collectPropertyFee(id, year, month, amount) {
  return collectFee(id, 'property', year, month, amount)
}

async function cancelPropertyFee(id, year, month) {
  return cancelFee(id, 'property', year, month)
}

// ---- 水费 ----

async function collectWaterFee(id, year, month, amount) {
  return collectFee(id, 'water', year, month, amount)
}

async function cancelWaterFee(id, year, month) {
  return cancelFee(id, 'water', year, month)
}

// ---- 电费 ----

async function collectElectricFee(id, year, month, amount) {
  return collectFee(id, 'electric', year, month, amount)
}

async function cancelElectricFee(id, year, month) {
  return cancelFee(id, 'electric', year, month)
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
  setMonthlyFee,
  collectFee,
  cancelFee,
  collectPropertyFee,
  cancelPropertyFee,
  collectWaterFee,
  cancelWaterFee,
  collectElectricFee,
  cancelElectricFee,
  calcTotalReceived
}
