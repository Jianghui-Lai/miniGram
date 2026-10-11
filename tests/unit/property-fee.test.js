/**
 * 物业费单元测试（fee-status + property-repo 的物业费读写）
 *
 * 核心约定：
 * - 物业费与租金完全分开：不进 paymentHistory、不进年历、不进首页统计、不进收租提醒；
 * - 金额口径：物业费是代缴/转交款，不计入「累计已收租金」；
 * - 老数据没有 propertyFee / propertyFeeHistory 字段时一律当「未设置」，不能崩。
 */

const fs = require('fs')
const path = require('path')

const feeStatus = require('../../miniprogram/utils/fee-status.js')
const propertyRepo = require('../../miniprogram/utils/property-repo.js')
const dateUtils = require('../../miniprogram/utils/date-utils.js')

const DETAIL_WXML = path.join(
  __dirname,
  '../../miniprogram/pages/property-detail/property-detail.wxml'
)

let saved = null
let writeFails = false

beforeEach(() => {
  saved = null
  writeFails = false
  global.wx = {
    getStorage: ({ key, success, fail }) => {
      if (key === 'properties' && saved) return success({ data: saved })
      fail({ errMsg: 'getStorage:fail' })
    },
    setStorage: ({ data, success, fail }) => {
      if (writeFails) {
        writeFails = false
        return fail({ errMsg: 'setStorage:fail' })
      }
      saved = JSON.parse(JSON.stringify(data))
      success()
    }
  }
})

function seedOne(overrides) {
  saved = [Object.assign({
    id: 1,
    address: '阳光小区 3-101',
    monthlyRent: 3000,
    propertyFee: 200,
    leaseStart: '2024-01-01',
    leaseEnd: '2024-12-31',
    paymentHistory: [],
    propertyFeeHistory: [],
    updatedAt: '2024-01-01T00:00:00.000Z'
  }, overrides)]
}

// ============================================
// F系列：fee-status 三态
// ============================================
describe('F系列：fee-status 物业费状态', () => {

  test('F-01: 没设金额 → 未设置（老房产兼容）', () => {
    const detail = feeStatus.getStatusDetail({ monthlyRent: 3000 }, 2026, 10)
    expect(detail.status).toBe('not_set')
    expect(detail.text).toBe('未设置')
    expect(detail.hasFee).toBe(false)
    expect(detail.dueAmount).toBe(0)
  })

  test('F-02: 设了金额但当月没缴 → 未缴', () => {
    const detail = feeStatus.getStatusDetail({ propertyFee: 200 }, 2026, 10)
    expect(detail.status).toBe('unpaid')
    expect(detail.text).toBe('未缴')
    expect(detail.hasFee).toBe(true)
    expect(detail.dueAmount).toBe(200)
  })

  test('F-03: 当月有已缴记录 → 已缴（带金额与日期）', () => {
    const unit = {
      propertyFee: 200,
      propertyFeeHistory: [
        { year: 2026, month: 10, status: 'paid', date: '2026-10-05', amount: 200 }
      ]
    }
    const detail = feeStatus.getStatusDetail(unit, 2026, 10)
    expect(detail.status).toBe('paid')
    expect(detail.text).toBe('已缴')
    expect(detail.amount).toBe(200)
    expect(detail.date).toBe('2026-10-05')
  })

  test('F-04: 只认当月，其他月已缴不影响本月', () => {
    const unit = {
      propertyFee: 200,
      propertyFeeHistory: [
        { year: 2026, month: 9, status: 'paid', date: '2026-09-05', amount: 200 }
      ]
    }
    expect(feeStatus.getStatus(unit, 2026, 10)).toBe('unpaid')
    expect(feeStatus.getStatus(unit, 2026, 9)).toBe('paid')
  })

  test('F-05: 未设置优先级最高（有缴纳记录也显示未设置）', () => {
    const unit = {
      propertyFeeHistory: [
        { year: 2026, month: 10, status: 'paid', date: '2026-10-05', amount: 200 }
      ]
    }
    expect(feeStatus.getStatus(unit, 2026, 10)).toBe('not_set')
  })

  test('F-06: 0 元视为未设置（免物业费）', () => {
    expect(feeStatus.hasFee({ propertyFee: 0 })).toBe(false)
    expect(feeStatus.getStatus({ propertyFee: 0 }, 2026, 10)).toBe('not_set')
  })

  test('F-07: 撤销后的记录（unpaid）不算已缴', () => {
    const unit = {
      propertyFee: 200,
      propertyFeeHistory: [{ year: 2026, month: 10, status: 'unpaid', date: null, amount: 0 }]
    }
    expect(feeStatus.getStatus(unit, 2026, 10)).toBe('unpaid')
  })

  test('F-08: 脏金额（字符串 / null）不崩', () => {
    expect(feeStatus.getMonthlyFee({ propertyFee: '200' })).toBe(200)
    expect(feeStatus.getMonthlyFee({ propertyFee: null })).toBe(0)
    expect(feeStatus.getStatusDetail(null, 2026, 10).status).toBe('not_set')
  })

  test('F-09: 物业费不绑定租期（空租期也照常判定）', () => {
    const unit = { propertyFee: 200, leaseStart: '', leaseEnd: '' }
    expect(feeStatus.getStatus(unit, 2026, 10)).toBe('unpaid')
  })
})

// ============================================
// R系列：物业费读写
// ============================================
describe('R系列：collectPropertyFee() / cancelPropertyFee()', () => {

  test('R-01: 标记已缴写入金额与日期', async () => {
    seedOne()
    const ok = await propertyRepo.collectPropertyFee(1, 2026, 10, 200)
    expect(ok).toBe(true)
    expect(saved[0].propertyFeeHistory).toHaveLength(1)
    expect(saved[0].propertyFeeHistory[0].amount).toBe(200)
    expect(saved[0].propertyFeeHistory[0].date).toBe(dateUtils.formatDate(new Date()))
    expect(feeStatus.getStatus(saved[0], 2026, 10)).toBe('paid')
  })

  test('R-02: 不传金额时按该房产月物业费入账', async () => {
    seedOne()
    await propertyRepo.collectPropertyFee(1, 2026, 10)
    expect(saved[0].propertyFeeHistory[0].amount).toBe(200)
  })

  test('R-03: 重复标记不覆盖原始金额（幂等）', async () => {
    seedOne()
    await propertyRepo.collectPropertyFee(1, 2026, 10, 200)
    const firstDate = saved[0].propertyFeeHistory[0].date
    await propertyRepo.collectPropertyFee(1, 2026, 10, 9999)
    expect(saved[0].propertyFeeHistory).toHaveLength(1)
    expect(saved[0].propertyFeeHistory[0].amount).toBe(200)
    expect(saved[0].propertyFeeHistory[0].date).toBe(firstDate)
  })

  test('R-04: 撤销后回到未缴，且可再缴', async () => {
    seedOne()
    await propertyRepo.collectPropertyFee(1, 2026, 10, 200)
    expect(await propertyRepo.cancelPropertyFee(1, 2026, 10)).toBe(true)
    expect(feeStatus.getStatus(saved[0], 2026, 10)).toBe('unpaid')
    await propertyRepo.collectPropertyFee(1, 2026, 10, 200)
    expect(feeStatus.getStatus(saved[0], 2026, 10)).toBe('paid')
    expect(saved[0].propertyFeeHistory).toHaveLength(1)
  })

  test('R-05: 房产不存在 / 无记录 → 返回 false', async () => {
    seedOne()
    expect(await propertyRepo.collectPropertyFee(999, 2026, 10, 200)).toBe(false)
    expect(await propertyRepo.cancelPropertyFee(1, 2026, 10)).toBe(false)
  })

  test('R-06: 写入失败必须返回 false（不能让 await 永远挂着）', async () => {
    seedOne()
    writeFails = true
    expect(await propertyRepo.collectPropertyFee(1, 2026, 10, 200)).toBe(false)
  })

  test('R-07: 老房产（无 propertyFeeHistory 字段）也能标记，不崩', async () => {
    seedOne()
    delete saved[0].propertyFee
    delete saved[0].propertyFeeHistory
    expect(await propertyRepo.collectPropertyFee(1, 2026, 10, 200)).toBe(true)
    expect(saved[0].propertyFeeHistory).toHaveLength(1)
  })
})

// ============================================
// X系列：与租金彻底分开
// ============================================
describe('X系列：物业费不污染租金口径', () => {

  test('X-01: 缴物业费不动 paymentHistory，也不进累计已收租金', async () => {
    seedOne()
    await propertyRepo.collectPropertyFee(1, 2026, 10, 200)
    expect(saved[0].paymentHistory).toEqual([])
    expect(propertyRepo.calcTotalReceived(saved[0])).toBe(0)
  })

  test('X-02: 收租金不动 propertyFeeHistory', async () => {
    seedOne()
    await propertyRepo.collectRent(1, 2026, 10, 3000)
    expect(propertyRepo.calcTotalReceived(saved[0])).toBe(3000)
    expect(saved[0].propertyFeeHistory).toEqual([])
    expect(feeStatus.getStatus(saved[0], 2026, 10)).toBe('unpaid')
  })

  test('X-03: create 落盘 propertyFee 与空的历史', async () => {
    saved = null
    const created = await propertyRepo.create({ address: 'A', monthlyRent: '3000', propertyFee: '200' })
    expect(created.propertyFee).toBe(200)
    expect(created.propertyFeeHistory).toEqual([])
  })

  test('X-04: create 不填物业费 → 0', async () => {
    saved = null
    const created = await propertyRepo.create({ address: 'A', monthlyRent: '3000' })
    expect(created.propertyFee).toBe(0)
    expect(created.propertyFeeHistory).toEqual([])
  })

  test('X-05: 编辑能改物业费，且冲不掉已缴历史', async () => {
    seedOne()
    await propertyRepo.collectPropertyFee(1, 2026, 10, 200)
    const ok = await propertyRepo.update(1, {
      address: '阳光小区 3-101',
      monthlyRent: '3000',
      propertyFee: '260',
      propertyFeeHistory: []
    })
    expect(ok).toBe(true)
    expect(saved[0].propertyFee).toBe(260)
    expect(saved[0].propertyFeeHistory).toHaveLength(1)
    expect(feeStatus.getStatus(saved[0], 2026, 10)).toBe('paid')
  })

  test('X-06: 编辑时不带 propertyFee 则保留原值', async () => {
    seedOne()
    await propertyRepo.update(1, { address: '新地址', monthlyRent: '3000' })
    expect(saved[0].propertyFee).toBe(200)
  })
})

// ============================================
// W系列：详情页接线
// ============================================
describe('W系列：详情页物业费接线', () => {

  const wxml = fs.readFileSync(DETAIL_WXML, 'utf8')

  test('W-01: 详情页绑定了 toggleFee 且按费用类型分发', () => {
    expect(wxml).toContain('bindtap="toggleFee"')
    expect(wxml).toContain('data-key="{{item.key}}"')
    expect(wxml).toContain('wx:for="{{feeList}}"')
  })

  test('W-02: 编辑弹窗有物业费输入框', () => {
    expect(wxml).toContain('data-field="propertyFee"')
  })
})

// ============================================
// E系列：水费 / 电费（每月录入金额，没有房产级默认值）
// ============================================
describe('E系列：水费 / 电费状态', () => {

  test('E-01: 房产上没有水费金额字段，恒为 0，但永远可点', () => {
    expect(feeStatus.getMonthlyFee({ propertyFee: 200 }, 'water')).toBe(0)
    expect(feeStatus.hasFee({ propertyFee: 200 }, 'water')).toBe(true)
    expect(feeStatus.getStatusDetail({}, 2026, 10, 'water').tappable).toBe(true)
  })

  test('E-02: 当月没录入金额 → 未设置（占位留空，页面上不显示任何东西）', () => {
    const detail = feeStatus.getStatusDetail({}, 2026, 10, 'water')
    expect(detail.status).toBe('not_set')
    expect(detail.needInput).toBe(true)
    expect(detail.placeholder).toBe('')
    expect(detail.dueAmount).toBe(0)
    // 物业费没设金额时仍显示「未设置」
    expect(feeStatus.getStatusDetail({}, 2026, 10, 'property').placeholder).toBe('未设置')
  })

  test('E-03: 录入当月金额后 → 未缴，且显示该金额', () => {
    const unit = {
      waterFeeHistory: [{ year: 2026, month: 10, status: 'unpaid', dueAmount: 58, amount: 0, date: null }]
    }
    const detail = feeStatus.getStatusDetail(unit, 2026, 10, 'water')
    expect(detail.status).toBe('unpaid')
    expect(detail.text).toBe('未缴')
    expect(detail.dueAmount).toBe(58)
    expect(detail.unitLabel).toBe('元')
  })

  test('E-04: 付款后 → 已缴，带实收金额与日期', () => {
    const unit = {
      waterFeeHistory: [{ year: 2026, month: 10, status: 'paid', dueAmount: 58, amount: 58, date: '2026-10-08' }]
    }
    const detail = feeStatus.getStatusDetail(unit, 2026, 10, 'water')
    expect(detail.status).toBe('paid')
    expect(detail.amount).toBe(58)
    expect(detail.date).toBe('2026-10-08')
  })

  test('E-05: 撤销后回到未缴，且保留当月金额', async () => {
    seedOne()
    await propertyRepo.setMonthlyFee(1, 'water', 2026, 10, 58)
    await propertyRepo.collectWaterFee(1, 2026, 10)
    expect(feeStatus.getStatus(saved[0], 2026, 10, 'water')).toBe('paid')

    expect(await propertyRepo.cancelWaterFee(1, 2026, 10)).toBe(true)
    const detail = feeStatus.getStatusDetail(saved[0], 2026, 10, 'water')
    expect(detail.status).toBe('unpaid') // 不是 not_set
    expect(detail.dueAmount).toBe(58)    // 金额留着，直接再点就能重新付
    expect(detail.amount).toBe(0)
  })

  test('E-06: 只认当月，其他月不影响本月', () => {
    const unit = {
      waterFeeHistory: [{ year: 2026, month: 9, status: 'paid', dueAmount: 58, amount: 58, date: '2026-09-08' }]
    }
    expect(feeStatus.getStatus(unit, 2026, 10, 'water')).toBe('not_set')
    expect(feeStatus.getStatus(unit, 2026, 9, 'water')).toBe('paid')
  })

  test('E-07: setMonthlyFee 只写应收，不动缴纳状态', async () => {
    seedOne()
    expect(await propertyRepo.setMonthlyFee(1, 'electric', 2026, 10, 132.5)).toBe(true)
    expect(feeStatus.getStatus(saved[0], 2026, 10, 'electric')).toBe('unpaid')
    expect(feeStatus.getMonthlyDue(saved[0], 2026, 10, 'electric')).toBe(132.5)
    expect(saved[0].electricFeeHistory[0].amount).toBe(0)
  })

  test('E-08: 老房产（无水电历史字段）也能录入与缴纳，不崩', async () => {
    seedOne()
    delete saved[0].waterFeeHistory
    expect(await propertyRepo.setMonthlyFee(1, 'water', 2026, 10, 58)).toBe(true)
    expect(await propertyRepo.collectWaterFee(1, 2026, 10)).toBe(true)
    expect(feeStatus.getStatus(saved[0], 2026, 10, 'water')).toBe('paid')
    expect(saved[0].waterFeeHistory).toHaveLength(1)
  })

  test('E-09: 电费读写：幂等 / 撤销后再缴 / 写失败返回 false', async () => {
    seedOne()
    await propertyRepo.collectElectricFee(1, 2026, 10, 132.5)
    const firstDate = saved[0].electricFeeHistory[0].date
    await propertyRepo.collectElectricFee(1, 2026, 10, 9999)
    expect(saved[0].electricFeeHistory).toHaveLength(1)
    expect(saved[0].electricFeeHistory[0].amount).toBe(132.5)
    expect(saved[0].electricFeeHistory[0].date).toBe(firstDate)

    await propertyRepo.cancelElectricFee(1, 2026, 10)
    await propertyRepo.collectElectricFee(1, 2026, 10, 140)
    expect(feeStatus.getStatus(saved[0], 2026, 10, 'electric')).toBe('paid')
    expect(saved[0].electricFeeHistory).toHaveLength(1)

    writeFails = true
    expect(await propertyRepo.collectWaterFee(1, 2026, 10, 58)).toBe(false)
  })

  test('E-10: 房产不存在 / 无记录 → 返回 false', async () => {
    seedOne()
    expect(await propertyRepo.collectWaterFee(999, 2026, 10, 58)).toBe(false)
    expect(await propertyRepo.cancelWaterFee(1, 2026, 10)).toBe(false)
    expect(await propertyRepo.cancelElectricFee(1, 2026, 10)).toBe(false)
  })

  test('E-11: 三费互不干扰，也都不污染租金口径', async () => {
    seedOne()
    await propertyRepo.collectWaterFee(1, 2026, 10, 58)
    await propertyRepo.collectElectricFee(1, 2026, 10, 132.5)

    expect(saved[0].propertyFeeHistory).toEqual([])
    expect(feeStatus.getStatus(saved[0], 2026, 10, 'water')).toBe('paid')
    expect(feeStatus.getStatus(saved[0], 2026, 10, 'electric')).toBe('paid')
    expect(feeStatus.getStatus(saved[0], 2026, 10, 'property')).toBe('unpaid')

    await propertyRepo.cancelWaterFee(1, 2026, 10)
    expect(feeStatus.getStatus(saved[0], 2026, 10, 'electric')).toBe('paid')

    expect(saved[0].paymentHistory).toEqual([])
    expect(propertyRepo.calcTotalReceived(saved[0])).toBe(0)
  })

  test('E-12: buildFeeList 一次给出三类费用，顺序固定', () => {
    const list = feeStatus.buildFeeList({ propertyFee: 200 }, 2026, 10)
    expect(list.map(f => f.key)).toEqual(['property', 'water', 'electric'])
    expect(list[0].status).toBe('unpaid')
    expect(list[1].needInput).toBe(true)
    expect(list[2].needInput).toBe(true)
  })

  test('E-13: 未知类型一律当物业费，脏 key 不打穿页面', () => {
    expect(feeStatus.getFeeDef('wat').key).toBe('property')
  })
})

// ============================================
// C系列：create / update 对水电历史的初始化与保护
// ============================================
describe('C系列：水电历史的初始化与保护', () => {

  test('C-01: create 落两个空历史，且不落水电金额字段', async () => {
    saved = null
    const created = await propertyRepo.create({ address: 'A', monthlyRent: '3000', propertyFee: '200' })
    expect(created.waterFeeHistory).toEqual([])
    expect(created.electricFeeHistory).toEqual([])
    expect(created.waterFee).toBe(undefined)
    expect(created.electricFee).toBe(undefined)
  })

  test('C-02: 编辑冲不掉水电历史', async () => {
    seedOne()
    await propertyRepo.collectWaterFee(1, 2026, 10, 58)
    await propertyRepo.collectElectricFee(1, 2026, 10, 132.5)

    const ok = await propertyRepo.update(1, {
      address: '阳光小区 3-101',
      monthlyRent: '3000',
      waterFeeHistory: [],
      electricFeeHistory: []
    })
    expect(ok).toBe(true)
    expect(saved[0].waterFeeHistory).toHaveLength(1)
    expect(saved[0].electricFeeHistory).toHaveLength(1)
    expect(feeStatus.getStatus(saved[0], 2026, 10, 'water')).toBe('paid')
  })
})
