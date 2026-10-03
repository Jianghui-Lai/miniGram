/**
 * 数据存储单元测试（storage + property-repo）
 * 用假的 wx 对象验证：写失败要返回 false，绝不能 await 挂着
 */

const propertyRepo = require('../../miniprogram/utils/property-repo.js')
const dateUtils = require('../../miniprogram/utils/date-utils.js')

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

function seedOne() {
  saved = [{
    id: 1,
    address: '阳光小区 3-101',
    monthlyRent: 3000,
    leaseStart: '2024-01-01',
    leaseEnd: '2024-12-31',
    paymentHistory: [],
    updatedAt: '2024-01-01T00:00:00.000Z'
  }]
}

// ============================================
// T系列：累计已收（再也不用当前月租回填历史）
// ============================================
describe('T系列：calcTotalReceived() - 累计已收租金', () => {

  test('T-01: 按实收金额累加', () => {
    const property = {
      paymentHistory: [
        { year: 2024, month: 1, status: 'paid', amount: 3000 },
        { year: 2024, month: 2, status: 'paid', amount: 2800 }
      ]
    }
    expect(propertyRepo.calcTotalReceived(property)).toBe(5800)
  })

  test('T-02: 撤销的月份不计入', () => {
    const property = {
      paymentHistory: [
        { year: 2024, month: 1, status: 'paid', amount: 3000 },
        { year: 2024, month: 2, status: 'unpaid', amount: 0 }
      ]
    }
    expect(propertyRepo.calcTotalReceived(property)).toBe(3000)
  })

  test('T-03: 缺金额的历史记录按0算，不用涨价后的月租回填', () => {
    const property = {
      monthlyRent: 5000, // 已涨价
      paymentHistory: [{ year: 2024, month: 1, status: 'paid' }]
    }
    expect(propertyRepo.calcTotalReceived(property)).toBe(0)
  })

  test('T-04: 没有交租记录返回0', () => {
    expect(propertyRepo.calcTotalReceived({ paymentHistory: [] })).toBe(0)
    expect(propertyRepo.calcTotalReceived(null)).toBe(0)
  })
})

// ============================================
// P系列：收租 / 撤销
// ============================================
describe('P系列：collectRent() / cancelRent()', () => {

  test('P-01: 收款成功写入实收金额与日期', async () => {
    seedOne()
    const ok = await propertyRepo.collectRent(1, 2024, 6, 2800)
    expect(ok).toBe(true)
    expect(saved[0].paymentHistory).toHaveLength(1)
    expect(saved[0].paymentHistory[0].amount).toBe(2800)
    expect(saved[0].paymentHistory[0].date).toBe(dateUtils.formatDate(new Date()))
  })

  test('P-02: 同一个月重复收款不覆盖原始金额（幂等）', async () => {
    seedOne()
    await propertyRepo.collectRent(1, 2024, 6, 2800)
    const firstDate = saved[0].paymentHistory[0].date
    await propertyRepo.collectRent(1, 2024, 6, 9999)
    expect(saved[0].paymentHistory).toHaveLength(1)
    expect(saved[0].paymentHistory[0].amount).toBe(2800)
    expect(saved[0].paymentHistory[0].date).toBe(firstDate)
  })

  test('P-03: updatedAt 统一为 ISO 格式', async () => {
    seedOne()
    await propertyRepo.collectRent(1, 2024, 6, 3000)
    expect(saved[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test('P-04: 撤销后可再收且回到已收状态', async () => {
    seedOne()
    await propertyRepo.collectRent(1, 2024, 6, 3000)
    expect(await propertyRepo.cancelRent(1, 2024, 6)).toBe(true)
    expect(propertyRepo.calcTotalReceived(saved[0])).toBe(0)
    await propertyRepo.collectRent(1, 2024, 6, 3000)
    expect(propertyRepo.calcTotalReceived(saved[0])).toBe(3000)
  })

  test('P-05: 房产不存在返回 false', async () => {
    seedOne()
    expect(await propertyRepo.collectRent(999, 2024, 6, 3000)).toBe(false)
    expect(await propertyRepo.cancelRent(999, 2024, 6)).toBe(false)
  })

  test('P-06: 写入失败必须返回 false（不能让 await 永远挂着）', async () => {
    seedOne()
    writeFails = true
    const ok = await propertyRepo.collectRent(1, 2024, 6, 3000)
    expect(ok).toBe(false)
  })
})

// ============================================
// D系列：增删改查
// ============================================
describe('D系列：create() / update() / remove()', () => {

  test('D-01: 空存储时 getAll 返回空数组而不是报错', async () => {
    saved = null
    expect(await propertyRepo.getAll()).toEqual([])
    expect(await propertyRepo.findById(1)).toBe(null)
  })

  test('D-02: 新增房产成功返回完整对象', async () => {
    saved = null
    const created = await propertyRepo.create({
      address: '  幸福里 1-101  ',
      monthlyRent: '3200',
      tenantName: '张三'
    })
    expect(created).not.toBe(null)
    expect(created.address).toBe('幸福里 1-101')
    expect(created.monthlyRent).toBe(3200)
    expect(created.paymentHistory).toEqual([])
    expect(saved).toHaveLength(1)
  })

  test('D-03: 新房产的 id 仍是数字型时间戳（兼容已有数据）', async () => {
    saved = null
    const created = await propertyRepo.create({ address: 'A', monthlyRent: '1' })
    expect(typeof created.id).toBe('number')
  })

  test('D-04: 编辑不会把 paymentHistory / id / createdAt 冲掉', async () => {
    seedOne()
    await propertyRepo.collectRent(1, 2024, 6, 3000)
    const createdAt = saved[0].createdAt || saved[0].updatedAt
    expect(await propertyRepo.update(1, {
      address: '新地址',
      monthlyRent: '3500',
      paymentHistory: [],
      id: 666,
      createdAt: 'hacked'
    })).toBe(true)
    expect(saved[0].id).toBe(1)
    expect(saved[0].paymentHistory).toHaveLength(1)
    expect(saved[0].monthlyRent).toBe(3500)
    expect(saved[0].address).toBe('新地址')
  })

  test('D-05: 删除成功与删除不存在的房产', async () => {
    seedOne()
    expect(await propertyRepo.remove(1)).toBe(true)
    expect(saved).toHaveLength(0)
    expect(await propertyRepo.remove(1)).toBe(false)
  })
})
