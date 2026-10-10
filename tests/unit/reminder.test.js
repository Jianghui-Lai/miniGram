/**
 * 收租提醒单元测试
 * 测试文件: tests/unit/reminder.test.js
 *
 * 与 lease-manager.test.js 一样用「固定今天」的方式：
 * 全局 Date 被 Mock 成 2024-06-15，getPropertyStatus() 才会稳定判定为「出租中」。
 */

const {
  LEVEL,
  LEAD_DAYS,
  getReminderState,
  getReminderDay,
  buildReminderList,
  buildReminderSummary,
  attachReminder
} = require('../../miniprogram/utils/reminder.js')

// ============================================
// 固定测试日期：2024年6月15日
// ============================================
const TEST_DATE = new Date('2024-06-15T00:00:00')

const OriginalDate = global.Date
global.Date = function(...args) {
  if (args.length === 0) {
    return new OriginalDate(TEST_DATE)
  }
  return new OriginalDate(...args)
}
global.Date.now = OriginalDate.now

const TODAY = new OriginalDate(2024, 5, 15)

// 起租日决定每月提醒日：01-05 起租 → 每月 5 日
function makeProperty(overrides) {
  return Object.assign({
    id: 1,
    address: '阳光小区 3-101',
    monthlyRent: 3000,
    leaseStart: '2024-01-05',
    leaseEnd: '2025-01-04',
    paymentHistory: []
  }, overrides || {})
}

const DAY_MS = 24 * 60 * 60 * 1000
const daysFromToday = (n) => new OriginalDate(TEST_DATE.getTime() + n * DAY_MS)

// ============================================
// R系列：单套房产的提醒状态 (R-01 到 R-08)
// ============================================
describe('R系列：getReminderState() - 单套房产提醒状态', () => {

  test('R-01: 已过提醒日且未收租 → DUE，带逾期天数', () => {
    // 提醒日每月 5 日，今天 15 日 → 逾期 10 天
    const state = getReminderState(makeProperty(), 2024, 6, TODAY)
    expect(state.level).toBe(LEVEL.DUE)
    expect(state.levelText).toBe('已过收租日')
    expect(state.overdueDays).toBe(10)
    expect(state.daysDiff).toBe(-10)
    expect(state.amount).toBe(3000)
    expect(state.text).toBe('已过收租日 10 天')
    expect(state.reminderDate).toBe('2024-06-05')
  })

  test('R-02: 提醒日当天 → DUE，文案为「今天是收租日」', () => {
    const property = makeProperty({ leaseStart: '2024-06-15' })
    const state = getReminderState(property, 2024, 6, TODAY)
    expect(state.level).toBe(LEVEL.DUE)
    expect(state.overdueDays).toBe(0)
    expect(state.text).toBe('今天是收租日（6月15日）')
  })

  test('R-03: 提醒日在 LEAD_DAYS 天内 → UPCOMING', () => {
    // 提醒日每月 18 日，今天 15 日 → 3 天后
    const property = makeProperty({ leaseStart: '2024-01-18' })
    const state = getReminderState(property, 2024, 6, TODAY)
    expect(LEAD_DAYS).toBe(3)
    expect(state.level).toBe(LEVEL.UPCOMING)
    expect(state.daysDiff).toBe(3)
    expect(state.text).toBe('3 天后收租（6月18日）')
  })

  test('R-04: 提醒日还早 → NONE', () => {
    // 提醒日每月 20 日，今天 15 日 → 5 天后，超出预告窗口
    const property = makeProperty({ leaseStart: '2024-01-20' })
    const state = getReminderState(property, 2024, 6, TODAY)
    expect(state.level).toBe(LEVEL.NONE)
    expect(state.text).toBe('')
  })

  test('R-05: 本月已收租 → NONE', () => {
    const property = makeProperty({
      paymentHistory: [{ year: 2024, month: 6, amount: 3000, status: 'paid', date: '2024-06-06' }]
    })
    const state = getReminderState(property, 2024, 6, TODAY)
    expect(state.level).toBe(LEVEL.NONE)
    expect(state.overdueDays).toBe(0)
  })

  test('R-06: 非出租中（租期未开始 / 已结束）→ NONE', () => {
    const upcoming = makeProperty({ leaseStart: '2024-07-01', leaseEnd: '2025-06-30' })
    expect(getReminderState(upcoming, 2024, 6, TODAY).level).toBe(LEVEL.NONE)

    const expired = makeProperty({ leaseStart: '2023-01-05', leaseEnd: '2024-01-04' })
    expect(getReminderState(expired, 2024, 6, TODAY).level).toBe(LEVEL.NONE)
  })

  test('R-07: 无租期信息 / 空对象 → NONE', () => {
    expect(getReminderState(makeProperty({ leaseStart: '', leaseEnd: '' }), 2024, 6, TODAY).level)
      .toBe(LEVEL.NONE)
    expect(getReminderState(null, 2024, 6, TODAY).level).toBe(LEVEL.NONE)
  })

  test('R-08: 当月没有起租日那一天 → 提醒日取月末', () => {
    // 起租日 31 日，6 月无 31 号 → 提醒日 6/30，今天 15 日还没到
    const property = makeProperty({ leaseStart: '2024-01-31' })
    const state = getReminderState(property, 2024, 6, TODAY)
    expect(state.reminderDate).toBe('2024-06-30')
    expect(state.reminderDay).toBe(30)
    expect(state.level).toBe(LEVEL.NONE)

    // 2 月（2024 闰年）→ 29 日，且早于今天 → 已过提醒日
    const feb = getReminderState(property, 2024, 2, TODAY)
    expect(feb.reminderDate).toBe('2024-02-29')
    expect(feb.level).toBe(LEVEL.DUE)
  })
})

// ============================================
// L系列：列表与汇总 (L-01 到 L-04)
// ============================================
describe('L系列：buildReminderList() / buildReminderSummary()', () => {

  // 逾期 10 天 / 逾期 2 天 / 3 天后到期
  const list = [
    makeProperty({ id: 2, address: 'B 逾期2天', leaseStart: '2024-01-13' }),
    makeProperty({ id: 3, address: 'C 3天后', leaseStart: '2024-01-18' }),
    makeProperty({ id: 1, address: 'A 逾期10天', leaseStart: '2024-01-05' })
  ]

  test('L-01: 过滤掉不用提醒的，DUE 在前、逾期久的在前', () => {
    const items = buildReminderList(
      list.concat([makeProperty({ id: 4, address: 'D 已收租', paymentHistory: [
        { year: 2024, month: 6, amount: 3000, status: 'paid', date: '2024-06-05' }
      ] })]),
      2024, 6, TODAY
    )
    expect(items.map(i => i.property.id)).toEqual([1, 2, 3])
    expect(items.map(i => i.level)).toEqual([LEVEL.DUE, LEVEL.DUE, LEVEL.UPCOMING])
  })

  test('L-02: 汇总文案 - 有逾期时给出最长逾期天数', () => {
    const summary = buildReminderSummary(list, 2024, 6, TODAY)
    expect(summary.hasReminder).toBe(true)
    expect(summary.dueCount).toBe(2)
    expect(summary.upcomingCount).toBe(1)
    expect(summary.totalCount).toBe(3)
    expect(summary.maxOverdueDays).toBe(10)
    expect(summary.text).toBe('2 套已过收租日，最长逾期 10 天')
  })

  test('L-03: 汇总文案 - 只剩预告时给出最近天数', () => {
    const summary = buildReminderSummary([list[1]], 2024, 6, TODAY)
    expect(summary.dueCount).toBe(0)
    expect(summary.upcomingCount).toBe(1)
    expect(summary.text).toBe('1 套即将收租，最近 3 天后')
  })

  test('L-04: 全部不用提醒 → hasReminder 为 false', () => {
    const summary = buildReminderSummary([makeProperty({ leaseStart: '2024-01-20' })], 2024, 6, TODAY)
    expect(summary.hasReminder).toBe(false)
    expect(summary.totalCount).toBe(0)
    expect(summary.text).toBe('')
  })

  test('L-05: attachReminder 给每行挂上 _reminder', () => {
    const rows = [{ id: 1, monthlyRent: 3000, leaseStart: '2024-01-05', leaseEnd: '2025-01-04' }]
    const attached = attachReminder(rows, 2024, 6, TODAY)
    expect(attached[0]._reminder.level).toBe(LEVEL.DUE)
    expect(attached[0]._reminder.text).toBe('已过收租日 10 天')
    // 不污染原对象
    expect(rows[0]._reminder).toBeUndefined()
  })

  test('L-06: 不传 today 时跟随系统今天（Mock 的 2024-06-15）', () => {
    const state = getReminderState(makeProperty())
    expect(state.level).toBe(LEVEL.DUE)
    expect(state.overdueDays).toBe(10)
  })

  test('L-07: 跨天边界 - 提醒日正好是明天', () => {
    const property = makeProperty({ leaseStart: '2024-01-16' })
    const tomorrow = daysFromToday(1) // 6/16 = 提醒日
    expect(getReminderState(property, 2024, 6, tomorrow).level).toBe(LEVEL.DUE)
    expect(getReminderState(property, 2024, 6, TODAY).level).toBe(LEVEL.UPCOMING)
  })
})

// ============================================
// D系列：提醒日常驻展示
// ============================================
describe('D系列：getReminderDay() - 每月提醒日', () => {

  test('D-01: 取起租日的「日」', () => {
    expect(getReminderDay(makeProperty({ leaseStart: '2024-01-15' }))).toBe(15)
  })

  test('D-02: 起租日是月末 31 日', () => {
    expect(getReminderDay(makeProperty({ leaseStart: '2024-01-31' }))).toBe(31)
  })

  test('D-03: 无租期信息 → null', () => {
    expect(getReminderDay(makeProperty({ leaseStart: '' }))).toBe(null)
    expect(getReminderDay(null)).toBe(null)
  })
})
