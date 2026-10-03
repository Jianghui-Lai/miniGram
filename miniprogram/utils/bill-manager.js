/**
 * 月度账单管理 —— 【下一期专用，本轮不接线】
 *
 * 用途：为「多租客 + 水/电/物业分项收费」提前备好的账单模型。
 * 当前线上版本的收租动作仍走 utils/property-repo.js（collectRent / cancelRent）。
 * 迁移时机：开始做多租客时，账单从这里的 leaseId 维度生成，
 *          租金状态判断统一走 utils/rent-status.js（它已按「单个出租单元」设计好）。
 *
 * 负责账单的创建、查询、确认收款、撤销
 *
 * 费用说明：
 * - 租金：每月必缴，金额固定，计入累计已收租金和未收租金
 * - 物业费、水费、电费：作为状态展示（✅已收/❌未收），不参与金额汇总
 */

const store = require('./store.js')

// ============ 费用类型常量 ============
const FEE_TYPE = {
  RENT: 'rent',
  PROPERTY_FEE: 'propertyFee',
  WATER: 'water',
  ELECTRIC: 'electric'
}

const FEE_LABEL = {
  rent: '租金',
  propertyFee: '物业费',
  water: '水费',
  electric: '电费'
}

// ============ 查询 ============

/**
 * 获取某租约某月的账单
 * @param {string} leaseId
 * @param {number} year
 * @param {number} month
 * @returns {Object|null}
 */
function getBill(leaseId, year, month) {
  const bills = store.getList(store.KEYS.BILLS)
  return bills.find(b =>
    b.leaseId === leaseId && b.year === year && b.month === month
  ) || null
}

/**
 * 获取某租约所有账单
 * @param {string} leaseId
 * @returns {Array}
 */
function getBillsByLease(leaseId) {
  return store.findWhere(
    store.KEYS.BILLS,
    b => b.leaseId === leaseId
  )
}

/**
 * 获取某租约某年的所有账单
 * @param {string} leaseId
 * @param {number} year
 * @returns {Array}
 */
function getBillsByLeaseYear(leaseId, year) {
  return store.findWhere(
    store.KEYS.BILLS,
    b => b.leaseId === leaseId && b.year === year
  )
}

// ============ 创建 ============

/**
 * 创建某月的初始账单
 * @param {string} leaseId
 * @param {number} year
 * @param {number} month
 * @param {Object} defaults - { rentAmount, propertyFeeAmount }
 * @returns {Object}
 */
function createBill(leaseId, year, month, defaults) {
  const bill = {
    id: store.generateId('b'),
    leaseId,
    year,
    month,

    // 租金
    rentAmount: defaults.rentAmount || 0,
    rentActual: defaults.rentAmount || 0,
    rentPaid: false,
    rentPaidDate: null,

    // 物业费
    propertyFeeAmount: defaults.propertyFeeAmount || 0,
    propertyFeeActual: defaults.propertyFeeAmount || 0,
    propertyFeePaid: false,
    propertyFeePaidDate: null,

    // 水费
    waterAmount: 0,
    waterActual: 0,
    waterPaid: false,
    waterPaidDate: null,

    // 电费
    electricAmount: 0,
    electricActual: 0,
    electricPaid: false,
    electricPaidDate: null,

    remark: ''
  }

  return store.upsert(store.KEYS.BILLS, bill)
}

/**
 * 如果账单不存在则创建，存在则返回
 * @param {string} leaseId
 * @param {number} year
 * @param {number} month
 * @param {Object} defaults
 * @returns {Object}
 */
function ensureBill(leaseId, year, month, defaults) {
  let bill = getBill(leaseId, year, month)
  if (!bill) {
    bill = createBill(leaseId, year, month, defaults)
  }
  return bill
}

// ============ 更新 ============

/**
 * 更新账单的某个字段
 * @param {string} billId
 * @param {Object} updates
 * @returns {Object}
 */
function updateBill(billId, updates) {
  const bill = store.findById(store.KEYS.BILLS, billId)
  if (!bill) return null

  return store.upsert(store.KEYS.BILLS, {
    ...bill,
    ...updates
  })
}

/**
 * 更新某项费用的实收金额
 * @param {string} billId
 * @param {string} feeType - FEE_TYPE 中的值
 * @param {number} amount
 * @returns {Object}
 */
function updateFeeAmount(billId, feeType, amount) {
  const fieldMap = {
    rent: 'rentActual',
    propertyFee: 'propertyFeeActual',
    water: 'waterActual',
    electric: 'electricActual'
  }

  return updateBill(billId, {
    [fieldMap[feeType]]: amount
  })
}

/**
 * 更新某项费用的应收金额
 * @param {string} billId
 * @param {string} feeType
 * @param {number} amount
 * @returns {Object}
 */
function updateFeeDueAmount(billId, feeType, amount) {
  const fieldMap = {
    rent: 'rentAmount',
    propertyFee: 'propertyFeeAmount',
    water: 'waterAmount',
    electric: 'electricAmount'
  }

  return updateBill(billId, {
    [fieldMap[feeType]]: amount
  })
}

// ============ 确认收款 / 撤销 ============

/**
 * 确认某项费用已收
 * @param {string} billId
 * @param {string} feeType
 * @param {number} actualAmount - 实收金额
 * @returns {Object}
 */
function confirmFeePaid(billId, feeType, actualAmount) {
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`

  const paidFieldMap = {
    rent: 'rentPaid',
    propertyFee: 'propertyFeePaid',
    water: 'waterPaid',
    electric: 'electricPaid'
  }

  const actualFieldMap = {
    rent: 'rentActual',
    propertyFee: 'propertyFeeActual',
    water: 'waterActual',
    electric: 'electricActual'
  }

  const dateFieldMap = {
    rent: 'rentPaidDate',
    propertyFee: 'propertyFeePaidDate',
    water: 'waterPaidDate',
    electric: 'electricPaidDate'
  }

  return updateBill(billId, {
    [paidFieldMap[feeType]]: true,
    [actualFieldMap[feeType]]: actualAmount,
    [dateFieldMap[feeType]]: dateStr
  })
}

/**
 * 撤销某项费用的收款
 * @param {string} billId
 * @param {string} feeType
 * @returns {Object}
 */
function cancelFeePaid(billId, feeType) {
  const paidFieldMap = {
    rent: 'rentPaid',
    propertyFee: 'propertyFeePaid',
    water: 'waterPaid',
    electric: 'electricPaid'
  }

  const dateFieldMap = {
    rent: 'rentPaidDate',
    propertyFee: 'propertyFeePaidDate',
    water: 'waterPaidDate',
    electric: 'electricPaidDate'
  }

  return updateBill(billId, {
    [paidFieldMap[feeType]]: false,
    [dateFieldMap[feeType]]: null
  })
}

/**
 * 保存整张账单的编辑（从 bill-editor 弹窗保存时调用）
 * @param {string} billId
 * @param {Object} formData - 包含所有字段的新值
 * @returns {Object}
 */
function saveBill(billId, formData) {
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`

  const bill = store.findById(store.KEYS.BILLS, billId)
  if (!bill) return null

  const updates = { ...formData }

  // 租金
  if (formData.rentPaid && !bill.rentPaid) {
    updates.rentPaidDate = dateStr
  } else if (!formData.rentPaid) {
    updates.rentPaidDate = null
  }

  // 物业费
  if (formData.propertyFeePaid && !bill.propertyFeePaid) {
    updates.propertyFeePaidDate = dateStr
  } else if (!formData.propertyFeePaid) {
    updates.propertyFeePaidDate = null
  }

  // 水费
  if (formData.waterPaid && !bill.waterPaid) {
    updates.waterPaidDate = dateStr
  } else if (!formData.waterPaid) {
    updates.waterPaidDate = null
  }

  // 电费
  if (formData.electricPaid && !bill.electricPaid) {
    updates.electricPaidDate = dateStr
  } else if (!formData.electricPaid) {
    updates.electricPaidDate = null
  }

  return updateBill(billId, updates)
}

// ============ 计算（页面使用） ============

/**
 * 计算已收租金（只算租金）
 * @param {Object} bill
 * @returns {number}
 */
function calcPaidRent(bill) {
  if (!bill || !bill.rentPaid) return 0
  return bill.rentActual || 0
}

/**
 * 计算未收租金（只算租金）
 * @param {Object} bill
 * @returns {number}
 */
function calcUnpaidRent(bill) {
  if (!bill || bill.rentPaid) return 0
  return bill.rentAmount || 0
}

/**
 * 判断某项是否已收
 * @param {Object} bill
 * @param {string} feeType
 * @returns {boolean}
 */
function isFeePaid(bill, feeType) {
  if (!bill) return false
  const map = {
    rent: 'rentPaid',
    propertyFee: 'propertyFeePaid',
    water: 'waterPaid',
    electric: 'electricPaid'
  }
  return bill[map[feeType]] === true
}

/**
 * 判断账单是否全部已收
 * @param {Object} bill
 * @returns {boolean}
 */
function isFullyPaid(bill) {
  if (!bill) return false
  return bill.rentPaid && bill.propertyFeePaid && bill.waterPaid && bill.electricPaid
}

// ============ 计算（备用，暂未使用） ============

/**
 * 计算账单应收总额（租金 + 物业费，不含水电）
 * @param {Object} bill
 * @returns {number}
 */
function calcDueAmount(bill) {
  if (!bill) return 0
  return (bill.rentAmount || 0) + (bill.propertyFeeAmount || 0)
}

/**
 * 计算账单已收总额（所有费用）
 * @param {Object} bill
 * @returns {number}
 */
function calcPaidAmount(bill) {
  if (!bill) return 0
  let total = 0
  if (bill.rentPaid) total += bill.rentActual || 0
  if (bill.propertyFeePaid) total += bill.propertyFeeActual || 0
  if (bill.waterPaid) total += bill.waterActual || 0
  if (bill.electricPaid) total += bill.electricActual || 0
  return total
}

/**
 * 计算账单未收总额（租金 + 物业费）
 * @param {Object} bill
 * @returns {number}
 */
function calcUnpaidAmount(bill) {
  if (!bill) return 0
  let unpaid = 0
  if (!bill.rentPaid) unpaid += bill.rentAmount || 0
  if (!bill.propertyFeePaid) unpaid += bill.propertyFeeAmount || 0
  return unpaid
}

/**
 * 获取账单的未收明细
 * @param {Object} bill
 * @returns {Object} { rent, propertyFee, water, electric }
 */
function getUnpaidDetail(bill) {
  if (!bill) {
    return { rent: 0, propertyFee: 0, water: 0, electric: 0 }
  }
  return {
    rent: bill.rentPaid ? 0 : (bill.rentAmount || 0),
    propertyFee: bill.propertyFeePaid ? 0 : (bill.propertyFeeAmount || 0),
    water: bill.waterPaid ? 0 : (bill.waterAmount || 0),
    electric: bill.electricPaid ? 0 : (bill.electricAmount || 0)
  }
}

// ============ 删除 ============

/**
 * 删除某租约的所有账单
 * @param {string} leaseId
 * @returns {number}
 */
function deleteBillsByLease(leaseId) {
  return store.removeWhere(
    store.KEYS.BILLS,
    b => b.leaseId === leaseId
  )
}

// ============ 导出 ============

module.exports = {
  FEE_TYPE,
  FEE_LABEL,

  // 查询
  getBill,
  getBillsByLease,
  getBillsByLeaseYear,

  // 创建
  createBill,
  ensureBill,

  // 更新
  updateBill,
  updateFeeAmount,
  updateFeeDueAmount,

  // 确认 / 撤销
  confirmFeePaid,
  cancelFeePaid,
  saveBill,

  // 计算（页面使用）
  calcPaidRent,
  calcUnpaidRent,
  isFeePaid,
  isFullyPaid,

  // 计算（备用）
  calcDueAmount,
  calcPaidAmount,
  calcUnpaidAmount,
  getUnpaidDetail,

  // 删除
  deleteBillsByLease
}