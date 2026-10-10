/**
 * 物业费状态计算（纯函数，不碰存储、不碰 wx API）
 *
 * 与租金完全分离：
 * - 不读 paymentHistory，不参与年历圆点、首页应收/已收统计、收租提醒；
 * - 物业费不绑定租期 —— 房子空着也要交物业费，所以不复用 rent-status.isActiveInMonth；
 * - 老数据没有 propertyFee 字段时一律当 0（未设置），不会出现 undefined 元。
 *
 * 金额口径：物业费是房东代缴/转交给物业的款项，不是租金收入，
 * 因此不计入任何「已收租金」统计，只在房产信息区单独展示当月状态。
 */

const money = require('./money.js')

// 物业费月度状态
const STATUS = {
  NOT_SET: 'not_set', // 没填金额（老房产或免物业费）
  PAID: 'paid',       // 当月已缴
  UNPAID: 'unpaid'    // 当月未缴
}

const STATUS_MAP = {
  [STATUS.NOT_SET]: { text: '未设置', color: 'gray' },
  [STATUS.PAID]: { text: '已缴', color: 'green' },
  [STATUS.UNPAID]: { text: '未缴', color: 'orange' }
}

/**
 * 月物业费金额（元）
 * @param {Object} unit { propertyFee }
 * @returns {number} 未设置时为 0
 */
function getMonthlyFee(unit) {
  return money.num(unit?.propertyFee)
}

/**
 * 是否设置了物业费（> 0 才算设置，0 = 免收/未填）
 * @param {Object} unit
 * @returns {boolean}
 */
function hasFee(unit) {
  return getMonthlyFee(unit) > 0
}

/**
 * 找到某月的已缴记录
 * @returns {Object|null}
 */
function findPaidRecord(unit, year, month) {
  return (unit?.propertyFeeHistory || []).find(
    p => p.year === year && p.month === month && p.status === STATUS.PAID
  ) || null
}

/**
 * 某月的物业费状态
 * @param {Object} unit { propertyFee, propertyFeeHistory }
 * @param {number} year
 * @param {number} month 1-12
 * @returns {string} not_set | paid | unpaid
 */
function getStatus(unit, year, month) {
  if (!hasFee(unit)) return STATUS.NOT_SET
  return findPaidRecord(unit, year, month) ? STATUS.PAID : STATUS.UNPAID
}

/**
 * 某月物业费状态详情（给页面直接用）
 * @returns {{status:string, text:string, color:string, hasFee:boolean, dueAmount:number, amount:number, date:string|null}}
 */
function getStatusDetail(unit, year, month) {
  const status = getStatus(unit, year, month)
  const record = findPaidRecord(unit, year, month)

  return {
    status,
    ...STATUS_MAP[status],
    hasFee: hasFee(unit),
    dueAmount: getMonthlyFee(unit),
    amount: record ? money.num(record.amount) : 0,
    date: record?.date || null
  }
}

module.exports = {
  STATUS,
  STATUS_MAP,
  getMonthlyFee,
  hasFee,
  findPaidRecord,
  getStatus,
  getStatusDetail
}
