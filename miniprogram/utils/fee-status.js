/**
 * 费用状态计算（物业费 / 水费 / 电费，纯函数，不碰存储、不碰 wx API）
 *
 * 与租金完全分离：
 * - 不读 paymentHistory，不参与年历圆点、首页应收/已收统计、收租提醒；
 * - 费用不绑定租期 —— 房子空着也要交，所以不复用 rent-status.isActiveInMonth；
 * - 老数据没有金额 / 历史字段时一律当 0（未设置），不会出现 undefined 元。
 *
 * 金额口径：这些费用是房东代缴/转交的款项，不是租金收入，
 * 因此不计入任何「已收租金」统计，只在房产信息区单独展示当月状态。
 *
 * 两类费用：
 * - fixed（物业费）：房产上有一个固定月金额 propertyFee，点「未缴」直接按它入账；
 * - monthly（水费 / 电费）：房产上没有金额字段，每月先录入当月金额，再确认付款。
 *   当月金额存在月度记录的 dueAmount 上，与实收金额 amount 分开，
 *   撤销只清 status / amount / date，保留 dueAmount，撤销后不用重填。
 */

const money = require('./money.js')

// 月度状态
const STATUS = {
  NOT_SET: 'not_set', // fixed：没填金额；monthly：当月还没录入金额
  PAID: 'paid',       // 当月已缴
  UNPAID: 'unpaid'    // 当月未缴
}

const STATUS_MAP = {
  [STATUS.NOT_SET]: { text: '未设置', color: 'gray' },
  [STATUS.PAID]: { text: '已缴', color: 'green' },
  [STATUS.UNPAID]: { text: '未缴', color: 'orange' }
}

/**
 * 费用类型定义（全项目唯一真源）
 * amountField 为 null 表示「房产上没有金额字段，每月录入」
 */
const FEE_DEFS = {
  property: {
    key: 'property',
    label: '物业费',
    amountField: 'propertyFee',
    historyField: 'propertyFeeHistory',
    inputMode: 'fixed'
  },
  water: {
    key: 'water',
    label: '水费',
    amountField: null,
    historyField: 'waterFeeHistory',
    inputMode: 'monthly'
  },
  electric: {
    key: 'electric',
    label: '电费',
    amountField: null,
    historyField: 'electricFeeHistory',
    inputMode: 'monthly'
  }
}

// 详情页展示顺序
const FEE_ORDER = ['property', 'water', 'electric']

/**
 * 取费用定义，未知类型一律当物业费，避免脏 key 打穿页面
 * @param {string} type
 */
function getFeeDef(type) {
  return FEE_DEFS[type] || FEE_DEFS.property
}

/**
 * 某类费用的月度历史
 * @param {Object} unit
 * @param {string} type
 * @returns {Array}
 */
function getHistory(unit, type) {
  const history = unit?.[getFeeDef(type).historyField]
  return Array.isArray(history) ? history : []
}

/**
 * 房产上设置的月金额（元）
 * - fixed：取房产上的金额字段
 * - monthly：房产上没有金额字段，恒为 0（金额在当月记录的 dueAmount 上）
 * @param {Object} unit
 * @param {string} [type]
 * @returns {number} 未设置时为 0
 */
function getMonthlyFee(unit, type = 'property') {
  const def = getFeeDef(type)
  if (!def.amountField) return 0
  return money.num(unit?.[def.amountField])
}

/**
 * 是否设置了该类费用
 * - fixed：> 0 才算设置（0 = 免收/未填）
 * - monthly：恒为 true —— 每月录入，永远可以点，不存在「这套房不收费」的说法
 * @param {Object} unit
 * @param {string} [type]
 * @returns {boolean}
 */
function hasFee(unit, type = 'property') {
  if (!getFeeDef(type).amountField) return true
  return getMonthlyFee(unit, type) > 0
}

/**
 * 找到某月的费用记录（不论已缴 / 未缴）
 * @param {Object} unit
 * @param {number} year
 * @param {number} month
 * @param {string} [type]
 * @returns {Object|null}
 */
function findRecord(unit, year, month, type = 'property') {
  return getHistory(unit, type).find(r => r.year === year && r.month === month) || null
}

/**
 * 找到某月的已缴记录
 * @param {Object} unit
 * @param {number} year
 * @param {number} month
 * @param {string} [type]
 * @returns {Object|null}
 */
function findPaidRecord(unit, year, month, type = 'property') {
  const record = findRecord(unit, year, month, type)
  return record && record.status === STATUS.PAID ? record : null
}

/**
 * 某月应收金额
 * 优先取当月记录的 dueAmount（水 / 电每月录入的值），
 * 没有则回落到房产上的设置值（物业费），都没有就是 0
 * @param {Object} unit
 * @param {number} year
 * @param {number} month
 * @param {string} [type]
 * @returns {number}
 */
function getMonthlyDue(unit, year, month, type = 'property') {
  const record = findRecord(unit, year, month, type)
  if (record && money.num(record.dueAmount) > 0) return money.num(record.dueAmount)
  return getMonthlyFee(unit, type)
}

/**
 * 某月费用状态
 * @param {Object} unit
 * @param {number} year
 * @param {number} month 1-12
 * @param {string} [type]
 * @returns {string} not_set | paid | unpaid
 */
function getStatus(unit, year, month, type = 'property') {
  if (getMonthlyDue(unit, year, month, type) <= 0) return STATUS.NOT_SET
  return findPaidRecord(unit, year, month, type) ? STATUS.PAID : STATUS.UNPAID
}

/**
 * 某月费用状态详情（给页面直接用）
 * @param {Object} unit
 * @param {number} year
 * @param {number} month
 * @param {string} [type]
 * @returns {{key:string, label:string, status:string, text:string, color:string,
 *            hasFee:boolean, needInput:boolean, tappable:boolean,
 *            dueAmount:number, unitLabel:string, placeholder:string,
 *            amount:number, date:string|null}}
 */
function getStatusDetail(unit, year, month, type = 'property') {
  const def = getFeeDef(type)
  const status = getStatus(unit, year, month, type)
  const record = findPaidRecord(unit, year, month, type)
  const needInput = def.inputMode === 'monthly'

  return {
    ...STATUS_MAP[status],
    status,
    key: def.key,
    label: def.label,
    needInput,
    // 水 / 电永远可点（未设置时点它去录入当月金额）；物业费没设金额就不可点
    tappable: needInput || hasFee(unit, type),
    hasFee: hasFee(unit, type),
    dueAmount: getMonthlyDue(unit, year, month, type),
    unitLabel: needInput ? '元' : '元/月',
    // 没金额时显示的占位：水 / 电留空（不显示任何东西），物业费显示「未设置」
    placeholder: needInput ? '' : '未设置',
    amount: record ? money.num(record.amount) : 0,
    date: record?.date || null
  }
}

/**
 * 三类费用的当月状态列表（详情页直接 wx:for）
 * @param {Object} unit
 * @param {number} year
 * @param {number} month
 * @returns {Array}
 */
function buildFeeList(unit, year, month) {
  return FEE_ORDER.map(type => getStatusDetail(unit, year, month, type))
}

module.exports = {
  STATUS,
  STATUS_MAP,
  FEE_DEFS,
  FEE_ORDER,
  getFeeDef,
  getHistory,
  getMonthlyFee,
  hasFee,
  findRecord,
  findPaidRecord,
  getMonthlyDue,
  getStatus,
  getStatusDetail,
  buildFeeList
}
