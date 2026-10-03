/**
 * 月度租金状态单元测试（rent-status + property-query）
 * 固定「今天」= 2024-06-15
 */

const OriginalDate = global.Date
const TEST_DATE = new OriginalDate('2024-06-15T00:00:00')

global.Date = function (...args) {
  if (args.length === 0) return new OriginalDate(TEST_DATE)
  return new OriginalDate(...args)
}
global.Date.now = OriginalDate.now

const rentStatus = require('../../miniprogram/utils/rent-status.js')
const { buildDashboard, groupByStatus } = require('../../miniprogram/utils/property-query.js')

const PROPERTY = {
  id: 1,
  address: '阳光小区 3-101',
  monthlyRent: 3000,
  leaseStart: '2024-01-01',
  leaseEnd: '2024-12-31',
  paymentHistory: [
    { year: 2024, month: 5, status: 'paid', amount: 2800, date: '2024-05-03' }
  ]
}

// ============================================
// R系列：月度状态
// ============================================
describe('R系列：getMonthStatus() - 月度收租状态', () => {

  test('R-01: 已收款月份 = paid', () => {
    expect(rentStatus.getMonthStatus(PROPERTY, 2024, 5)).toBe('paid')
  })

  test('R-02: 当月未收 = unpaid', () => {
    expect(rentStatus.getMonthStatus(PROPERTY, 2024, 6)).toBe('unpaid')
  })

  test('R-03: 过去月份未收 = overdue', () => {
    expect(rentStatus.getMonthStatus(PROPERTY, 2024, 3)).toBe('overdue')
  })

  test('R-04: 租期外的月份 = not_active', () => {
    expect(rentStatus.getMonthStatus(PROPERTY, 2025, 1)).toBe('not_active')
  })

  test('R-05: 未来月份未收 = unpaid（不该被判成逾期）', () => {
    expect(rentStatus.getMonthStatus(PROPERTY, 2024, 11)).toBe('unpaid')
  })

  test('R-06: 撤销后回到未收状态', () => {
    const undone = {
      ...PROPERTY,
      paymentHistory: [{ year: 2024, month: 5, status: 'unpaid', amount: 0, date: null }]
    }
    expect(rentStatus.getMonthStatus(undone, 2024, 5)).toBe('overdue')
  })
})

// ============================================
// C系列：圆点颜色（方案A：只有两色）
// ============================================
describe('C系列：dotColor - 日历圆点只有收齐/未收齐两态', () => {

  test('C-01: 已收 = green', () => {
    expect(rentStatus.getMonthStatusDetail(PROPERTY, 2024, 5).dotColor).toBe('green')
  })

  test('C-02: 欠租 = gray（保留红色文字/统计，圆点不新增颜色）', () => {
    const detail = rentStatus.getMonthStatusDetail(PROPERTY, 2024, 3)
    expect(detail.dotColor).toBe('gray')
    expect(detail.text).toBe('欠租')
    expect(detail.color).toBe('red')
  })

  test('C-03: 待收/未出租都是 gray', () => {
    expect(rentStatus.getMonthStatusDetail(PROPERTY, 2024, 6).dotColor).toBe('gray')
    expect(rentStatus.getMonthStatusDetail(PROPERTY, 2025, 1).dotColor).toBe('gray')
  })
})

// ============================================
// Y系列：年度应缴月份
// ============================================
describe('Y系列：getDueMonthsInYear() - 年内应缴月份', () => {

  test('Y-01: 全年租期返回12个月', () => {
    expect(rentStatus.getDueMonthsInYear(PROPERTY, 2024)).toHaveLength(12)
  })

  test('Y-02: 未收月份金额取当前月租，已收月份取实收金额', () => {
    const months = rentStatus.getDueMonthsInYear(PROPERTY, 2024)
    const may = months.find(m => m.month === 5)
    const jun = months.find(m => m.month === 6)
    expect(may.amount).toBe(2800)
    expect(jun.amount).toBe(3000)
  })

  test('Y-03: 跨年租期只返回该年的月份', () => {
    const crossYear = { ...PROPERTY, leaseStart: '2023-11-01', leaseEnd: '2024-02-28' }
    const months = rentStatus.getDueMonthsInYear(crossYear, 2024)
    expect(months.map(m => m.month)).toEqual([1, 2])
  })

  test('Y-04: 没填租期返回空数组', () => {
    expect(rentStatus.getDueMonthsInYear({ leaseStart: '', leaseEnd: '' }, 2024)).toEqual([])
  })
})

// ============================================
// B系列：首页看板口径（已收 = 实收）
// ============================================
describe('B系列：buildDashboard() - 首页统计', () => {

  test('B-01: 已收按实收金额累加，不是合同月租', () => {
    const result = buildDashboard([PROPERTY], 2024, 6)
    expect(result.totalRent).toBe(3000)
    expect(result.paidRent).toBe(0) // 6月还没收
    expect(result.pendingRent).toBe(3000)
  })

  test('B-02: 少收的情况如实反映差额', () => {
    const result = buildDashboard([PROPERTY], 2024, 5)
    expect(result.totalRent).toBe(3000)
    expect(result.paidRent).toBe(2800)
    expect(result.pendingRent).toBe(200)
  })

  test('B-03: 看板统计的是「指定月份」的状态，不是自然月', () => {
    // 算 3 月：3 月已过去且未收 → 逾期
    const march = buildDashboard([PROPERTY], 2024, 3)
    expect(march.overdueCount).toBe(1)
    expect(march.pendingCount).toBe(1)

    // 算 6 月（当前月）：还没到月底 → 只是待收，不算逾期
    const june = buildDashboard([PROPERTY], 2024, 6)
    expect(june.overdueCount).toBe(0)
    expect(june.pendingCount).toBe(1)
  })

  test('B-04: 只统计出租中的房产', () => {
    const list = [
      PROPERTY,
      { id: 2, address: '空置房', monthlyRent: 5000, leaseStart: '', leaseEnd: '', paymentHistory: [] }
    ]
    const result = buildDashboard(list, 2024, 6)
    expect(result.properties).toHaveLength(1)
    expect(result.totalRent).toBe(3000)
  })

  test('B-05: 多套房产累加不出现浮点误差', () => {
    const list = [
      { ...PROPERTY, monthlyRent: 0.1 },
      { ...PROPERTY, id: 2, monthlyRent: 0.2 }
    ]
    const result = buildDashboard(list, 2024, 6)
    expect(result.totalRent).toBe(0.3)
  })
})

// ============================================
// G系列：分组
// ============================================
describe('G系列：groupByStatus() - 房产分组', () => {

  test('G-01: 三种状态各自归位', () => {
    const groups = groupByStatus([
      PROPERTY,
      { id: 2, leaseStart: '2024-07-01', leaseEnd: '2025-06-30' },
      { id: 3, leaseStart: '', leaseEnd: '' }
    ])
    expect(groups.rentingList).toHaveLength(1)
    expect(groups.upcomingList).toHaveLength(1)
    expect(groups.unrentedList).toHaveLength(1)
  })
})
