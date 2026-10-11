/**
 * property-detail 页面单元测试（当月费用：物业费 / 水费 / 电费）
 *
 * 沿用 add-property 那套「假 Page + 假 wx + 假 propertyRepo」：
 * - global.Page 捕获 Page({...}) 的配置对象；
 * - setData 用 Object.assign 模拟；
 * - propertyRepo 整体 mock，只关心「点了之后调了哪个函数、传了什么」。
 *
 * 重点验证三类费用的交互差异：
 * - 物业费：房产上有固定月金额，点「未缴」走普通确认框直接入账；
 * - 水 / 电：没有房产级金额，点「未设置」先录入当月金额，再点「未缴」确认付款；
 * - 取消弹窗 / 非法金额一律不落库。
 */

const mockRepo = {
  findById: jest.fn(),
  collectFee: jest.fn(),
  cancelFee: jest.fn(),
  setMonthlyFee: jest.fn(),
  collectRent: jest.fn(),
  cancelRent: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  calcTotalReceived: jest.fn(() => 0)
}

jest.mock('../../miniprogram/utils/property-repo.js', () => mockRepo)

const feeStatus = require('../../miniprogram/utils/fee-status.js')

let pageConfig = null

beforeAll(() => {
  global.Page = (cfg) => {
    pageConfig = cfg
  }
  require('../../miniprogram/pages/property-detail/property-detail.js')
})

beforeEach(() => {
  Object.values(mockRepo).forEach(fn => fn.mockReset())
  mockRepo.calcTotalReceived.mockReturnValue(0)
  global.wx = {
    showToast: jest.fn(),
    showModal: jest.fn(),
    navigateBack: jest.fn()
  }
})

/** 造一个干净的页面实例 */
function newPage(overrides) {
  const page = Object.assign({}, pageConfig)
  page.data = {
    ...pageConfig.data,
    propertyId: 1,
    currentYear: 2026,
    currentMonth: 10,
    feeList: feeStatus.buildFeeList({ propertyFee: 200 }, 2026, 10),
    ...overrides
  }
  page.setData = function (patch) {
    Object.assign(this.data, patch)
  }
  page.refreshAll = jest.fn()
  return page
}

/** 预设 showModal 的返回：confirm=true 且可带输入内容 */
function modalWillConfirm(content) {
  global.wx.showModal = jest.fn(({ success }) => success({ confirm: true, content }))
}

function modalWillCancel() {
  global.wx.showModal = jest.fn(({ success }) => success({ confirm: false }))
}

/** 取最后一次 showModal 的参数 */
function lastModal() {
  return global.wx.showModal.mock.calls[global.wx.showModal.mock.calls.length - 1][0]
}

// ============================================
// W系列：水费 / 电费 —— 点「未设置」录入当月金额
// ============================================
describe('W系列：水电费先录当月金额，再确认付款', () => {

  test('W-01: 水费未设置 → 弹出可输入弹窗，录入后只写应收、不改状态', async () => {
    const page = newPage()
    mockRepo.setMonthlyFee.mockResolvedValue(true)
    modalWillConfirm('58')

    await page.toggleFee({ currentTarget: { dataset: { key: 'water' } } })

    expect(lastModal().editable).toBe(true)
    expect(mockRepo.setMonthlyFee).toHaveBeenCalledWith(1, 'water', 2026, 10, 58)
    expect(mockRepo.collectFee).not.toHaveBeenCalled()
    expect(page.refreshAll).toHaveBeenCalled()
  })

  test('W-02: 已录入金额的水费 → 弹窗预填金额，确认即付款', async () => {
    const page = newPage()
    page.data.feeList = feeStatus.buildFeeList({
      propertyFee: 200,
      waterFeeHistory: [{ year: 2026, month: 10, status: 'unpaid', dueAmount: 58, amount: 0, date: null }]
    }, 2026, 10)
    mockRepo.collectFee.mockResolvedValue(true)
    modalWillConfirm('58')

    await page.toggleFee({ currentTarget: { dataset: { key: 'water' } } })

    expect(lastModal().content).toBe('58')
    expect(mockRepo.collectFee).toHaveBeenCalledWith(1, 'water', 2026, 10, 58)
    expect(mockRepo.setMonthlyFee).not.toHaveBeenCalled()
  })

  test('W-03: 付款时可以改金额，按实际填写值入账', async () => {
    const page = newPage()
    page.data.feeList = feeStatus.buildFeeList({
      waterFeeHistory: [{ year: 2026, month: 10, status: 'unpaid', dueAmount: 58, amount: 0, date: null }]
    }, 2026, 10)
    mockRepo.collectFee.mockResolvedValue(true)
    modalWillConfirm('62.35')

    await page.toggleFee({ currentTarget: { dataset: { key: 'water' } } })

    expect(mockRepo.collectFee).toHaveBeenCalledWith(1, 'water', 2026, 10, 62.35)
  })

  test('W-04: 电费走同一套逻辑，落到 electricFeeHistory', async () => {
    const page = newPage()
    mockRepo.setMonthlyFee.mockResolvedValue(true)
    modalWillConfirm('132.5')

    await page.toggleFee({ currentTarget: { dataset: { key: 'electric' } } })

    expect(mockRepo.setMonthlyFee).toHaveBeenCalledWith(1, 'electric', 2026, 10, 132.5)
  })

  test('W-05: 取消弹窗 → 什么都不写', async () => {
    const page = newPage()
    modalWillCancel()

    await page.toggleFee({ currentTarget: { dataset: { key: 'water' } } })

    expect(mockRepo.setMonthlyFee).not.toHaveBeenCalled()
    expect(mockRepo.collectFee).not.toHaveBeenCalled()
    expect(page.refreshAll).not.toHaveBeenCalled()
  })

  test('W-06: 非法金额（非数字 / 负数 / 空）一律不落库并提示', async () => {
    for (const bad of ['abc', '-5', '   ', '']) {
      const page = newPage()
      modalWillConfirm(bad)

      await page.toggleFee({ currentTarget: { dataset: { key: 'water' } } })

      expect(mockRepo.setMonthlyFee).not.toHaveBeenCalled()
      expect(global.wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '请输入有效金额' })
      )
    }
  })

  test('W-07: 写入失败要 toast，而不是静默成功', async () => {
    const page = newPage()
    mockRepo.setMonthlyFee.mockResolvedValue(false)
    modalWillConfirm('58')

    await page.toggleFee({ currentTarget: { dataset: { key: 'water' } } })

    expect(global.wx.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '保存失败，请重试' })
    )
    expect(page.refreshAll).not.toHaveBeenCalled()
  })

  test('W-08: 已缴 → 走撤销确认，撤销后金额保留（可直接再付）', async () => {
    const page = newPage()
    page.data.feeList = feeStatus.buildFeeList({
      waterFeeHistory: [{ year: 2026, month: 10, status: 'paid', dueAmount: 58, amount: 58, date: '2026-10-08' }]
    }, 2026, 10)
    mockRepo.cancelFee.mockResolvedValue(true)
    modalWillConfirm()

    await page.toggleFee({ currentTarget: { dataset: { key: 'water' } } })

    expect(lastModal().title).toContain('撤销')
    expect(mockRepo.cancelFee).toHaveBeenCalledWith(1, 'water', 2026, 10)
  })
})

// ============================================
// P系列：物业费 —— 保持原有「普通确认框」
// ============================================
describe('P系列：物业费按设置金额确认入账', () => {

  test('P-01: 未缴 → 普通确认框（不带输入框），按设置金额入账', async () => {
    const page = newPage()
    mockRepo.collectFee.mockResolvedValue(true)
    modalWillConfirm()

    await page.toggleFee({ currentTarget: { dataset: { key: 'property' } } })

    expect(lastModal().editable).toBeUndefined()
    expect(lastModal().content).toContain('200')
    expect(mockRepo.collectFee).toHaveBeenCalledWith(1, 'property', 2026, 10, 200)
  })

  test('P-02: 未设置（房产没填物业费）→ 点了也不弹窗、不写库', async () => {
    const page = newPage({
      feeList: feeStatus.buildFeeList({ monthlyRent: 3000 }, 2026, 10)
    })

    await page.toggleFee({ currentTarget: { dataset: { key: 'property' } } })

    expect(global.wx.showModal).not.toHaveBeenCalled()
    expect(mockRepo.collectFee).not.toHaveBeenCalled()
  })

  test('P-03: 已缴 → 撤销确认', async () => {
    const page = newPage({
      feeList: feeStatus.buildFeeList({
        propertyFee: 200,
        propertyFeeHistory: [{ year: 2026, month: 10, status: 'paid', date: '2026-10-05', amount: 200 }]
      }, 2026, 10)
    })
    mockRepo.cancelFee.mockResolvedValue(true)
    modalWillConfirm()

    await page.toggleFee({ currentTarget: { dataset: { key: 'property' } } })

    expect(mockRepo.cancelFee).toHaveBeenCalledWith(1, 'property', 2026, 10)
  })

  test('P-04: 未知 key / 脏数据不崩', async () => {
    const page = newPage()
    await page.toggleFee({ currentTarget: { dataset: { key: 'garbage' } } })
    await page.toggleFee({ currentTarget: { dataset: {} } })
    expect(global.wx.showModal).not.toHaveBeenCalled()
  })
})
