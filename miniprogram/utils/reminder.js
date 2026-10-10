/**
 * 收租提醒（应用层：把「算不算得出」变成「页面能不能直接用」）
 *
 * 定位：
 * - lease-manager 负责算「提醒日是哪天」（getReminderDate），本文件不再重复实现；
 * - rent-status 负责算「这个月收没收」，本文件只做 paid / not_active 的判定消费；
 * - 本文件只回答三件事：这套房现在该不该催、严重到什么程度、显示什么文案。
 *
 * 纯函数：不碰 wx API、不碰存储。today 可注入，方便单测固定日期。
 *
 * 提醒规则（沿用起租日的「日」）：
 *   起租日 2024-01-15 → 每月 15 日提醒；当月没有这一天时取月末（交给 getReminderDate 兜底）
 *   已到 / 已过提醒日且本月未收 → DUE（已过收租日）
 *   提醒日前 LEAD_DAYS 天内且本月未收 → UPCOMING（即将收租）
 *   其余 → NONE
 */

const dateUtils = require('./date-utils.js')
const money = require('./money.js')
const leaseManager = require('./lease-manager.js')
const rentStatus = require('./rent-status.js')

// 提醒级别
const LEVEL = {
  NONE: 'none',        // 不用管
  UPCOMING: 'upcoming', // 快到了
  DUE: 'due'            // 已过收租日
}

const LEVEL_TEXT = {
  [LEVEL.NONE]: '',
  [LEVEL.UPCOMING]: '即将收租',
  [LEVEL.DUE]: '已过收租日'
}

// 提前几天开始预告
const LEAD_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

function isDateLike(value) {
  return value instanceof Date ||
    (!!value && typeof value === 'object' && typeof value.getTime === 'function')
}

/**
 * 归一到当天零点
 * @param {Date|string} value 空则取今天
 * @returns {Date}
 */
function toDayStart(value) {
  if (!value) return dateUtils.today()
  const d = isDateLike(value) ? value : dateUtils.parseDate(value)
  if (!d || isNaN(d.getTime())) return dateUtils.today()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * 确定要算哪个月（不传 year/month 时跟随 today）
 */
function resolveTarget(today, year, month) {
  if (year && month) return { year, month }
  const d = toDayStart(today)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * 两个零点日期相差的自然日数（a - b）
 */
function diffDays(a, b) {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS)
}

function emptyState(extra) {
  return Object.assign({
    level: LEVEL.NONE,
    levelText: '',
    text: '',
    reminderDate: null,
    reminderDay: null,
    daysDiff: null,
    overdueDays: 0,
    amount: 0
  }, extra || {})
}

/**
 * 单套房产的提醒状态
 * @param {Object} property
 * @param {number} [year] 不传则取 today 所在月
 * @param {number} [month]
 * @param {Date|string} [today] 不传则取系统今天
 * @returns {{level:string, levelText:string, text:string, reminderDate:string|null,
 *            reminderDay:number|null, daysDiff:number|null, overdueDays:number, amount:number}}
 */
function getReminderState(property, year, month, today) {
  const today0 = toDayStart(today)
  const { year: y, month: m } = resolveTarget(today, year, month)

  if (!property) return emptyState()

  // 只有「出租中」且本月在租期内、本月没收租，才谈得上提醒
  if (leaseManager.getPropertyStatus(property) !== leaseManager.STATUS.RENTING) {
    return emptyState()
  }
  if (!rentStatus.isActiveInMonth(property, y, m)) return emptyState()
  if (rentStatus.findPaidRecord(property, y, m)) return emptyState()

  const reminderDate = leaseManager.getReminderDate(property.leaseStart, y, m)
  if (!reminderDate) return emptyState()

  const amount = money.num(property.monthlyRent)
  const daysDiff = diffDays(reminderDate, today0)
  const common = {
    reminderDate: dateUtils.formatDate(reminderDate),
    reminderDay: reminderDate.getDate(),
    daysDiff,
    amount
  }

  if (daysDiff <= 0) {
    return emptyState(Object.assign({}, common, {
      level: LEVEL.DUE,
      levelText: LEVEL_TEXT[LEVEL.DUE],
      overdueDays: daysDiff < 0 ? -daysDiff : 0,
      text: daysDiff === 0
        ? `今天是收租日（${m}月${reminderDate.getDate()}日）`
        : `已过收租日 ${-daysDiff} 天`
    }))
  }

  if (daysDiff <= LEAD_DAYS) {
    return emptyState(Object.assign({}, common, {
      level: LEVEL.UPCOMING,
      levelText: LEVEL_TEXT[LEVEL.UPCOMING],
      text: `${daysDiff} 天后收租（${m}月${reminderDate.getDate()}日）`
    }))
  }

  // 还没到预告窗口：不算提醒，但把提醒日带回给详情页展示「每月 X 日」
  return emptyState(common)
}

/**
 * 每月提醒日（取起租日的「日」），给详情页常驻展示用
 * @returns {number|null}
 */
function getReminderDay(property) {
  if (!property || !property.leaseStart) return null
  const start = dateUtils.parseDate(property.leaseStart)
  return start ? start.getDate() : null
}

/**
 * 一批房产的提醒列表（已过滤掉 NONE，DUE 优先、逾期久的优先）
 * @returns {Array<Object>} 每项 = { property, ...state }
 */
function buildReminderList(list, year, month, today) {
  const rank = { [LEVEL.DUE]: 0, [LEVEL.UPCOMING]: 1, [LEVEL.NONE]: 2 }

  return (list || [])
    .map(property => Object.assign({ property }, getReminderState(property, year, month, today)))
    .filter(item => item.level !== LEVEL.NONE)
    .sort((a, b) => (rank[a.level] - rank[b.level]) || (a.daysDiff - b.daysDiff))
}

/**
 * 给列表行挂上 _reminder，页面直接 item._reminder.text
 * @param {Array} rows buildDashboard 之后的房产行
 */
function attachReminder(rows, year, month, today) {
  return (rows || []).map(row => Object.assign({}, row, {
    _reminder: getReminderState(row, year, month, today)
  }))
}

/**
 * 首页横幅用的汇总
 * @returns {{hasReminder:boolean, dueCount:number, upcomingCount:number,
 *            totalCount:number, maxOverdueDays:number, text:string}}
 */
function buildReminderSummary(list, year, month, today) {
  const items = buildReminderList(list, year, month, today)
  const dueItems = items.filter(i => i.level === LEVEL.DUE)
  const upcomingItems = items.filter(i => i.level === LEVEL.UPCOMING)
  const maxOverdueDays = dueItems.reduce((max, i) => Math.max(max, i.overdueDays), 0)

  let text = ''
  if (dueItems.length) {
    text = `${dueItems.length} 套已过收租日`
    if (maxOverdueDays > 0) text += `，最长逾期 ${maxOverdueDays} 天`
  } else if (upcomingItems.length) {
    const nearest = upcomingItems[0]
    text = `${upcomingItems.length} 套即将收租，最近 ${nearest.daysDiff} 天后`
  }

  return {
    hasReminder: items.length > 0,
    dueCount: dueItems.length,
    upcomingCount: upcomingItems.length,
    totalCount: items.length,
    maxOverdueDays,
    text
  }
}

module.exports = {
  LEVEL,
  LEVEL_TEXT,
  LEAD_DAYS,
  getReminderState,
  getReminderDay,
  buildReminderList,
  buildReminderSummary,
  attachReminder
}
