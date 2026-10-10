/**
 * add-property 页面单元测试
 *
 * 小程序页面不能直接在 node 里跑，这里用「假 Page + 假 wx + 假 propertyRepo」
 * 把页面对象抠出来测：
 * - global.Page 捕获 Page({...}) 的配置对象；
 * - setData 用 Object.assign 模拟（和真机的合并语义一致）；
 * - propertyRepo 整体 mock，只关心「有没有被调用 / 传了什么 / 返回什么」。
 *
 * 标注 test.failing 的用例 = 已确认的实现缺陷（当前行为不符合预期）。
 * 缺陷修复后这些用例会「失败」，提醒你回来把 .failing 去掉。
 */

const fs = require('fs')
const path = require('path')

const mockCreate = jest.fn()

jest.mock('../../miniprogram/utils/property-repo.js', () => ({
  create: (...args) => mockCreate(...args)
}))

const PAGE_PATH = '../../miniprogram/pages/add-property/add-property.js'
const WXML_PATH = path.join(
  __dirname,
  '../../miniprogram/pages/add-property/add-property.wxml'
)

let pageConfig = null

beforeAll(() => {
  global.Page = (cfg) => {
    pageConfig = cfg
  }
  require(PAGE_PATH)
})

beforeEach(() => {
  mockCreate.mockReset()
  global.wx = {
    showLoading: jest.fn(),
    hideLoading: jest.fn(),
    showToast: jest.fn(),
    navigateBack: jest.fn()
  }
})

afterEach(() => {
  jest.useRealTimers()
})

/** 造一个干净的页面实例（每次都拿到全新的 data） */
function newPage() {
  const page = Object.assign({}, pageConfig)
  page.data = { ...pageConfig.data, errors: {} }
  page.setData = function (patch) {
    Object.assign(this.data, patch)
  }
  return page
}

/** 填好必填项，让表单处于「可提交」状态 */
function fillValid(page) {
  page.setData({
    address: '阳光小区 3-101',
    monthlyRent: '3000',
    tenantName: '张三',
    tenantPhone: '13800138000',
    leaseStart: '2024-01-01',
    leaseEnd: '2024-12-31',
    remark: '押一付三'
  })
  page.validateForm()
  return page
}

// ============================================
// A系列：房产地址
// ============================================
describe('A系列：onAddressInput() - 房产地址', () => {

  test('A-01: 输入地址立即写入并触发校验', () => {
    const page = newPage()
    page.onAddressInput({ detail: { value: '阳光小区 3-101' } })
    expect(page.data.address).toBe('阳光小区 3-101')
    expect(page.data.errors.address).toBeUndefined()
  })

  test('A-02: 只填地址还不够，没租金时不可提交', () => {
    const page = newPage()
    page.onAddressInput({ detail: { value: '阳光小区' } })
    expect(page.data.canSubmit).toBe(false)
    expect(page.data.errors.monthlyRent).toBe('请输入月租金')
  })

  test('A-03: 清空地址要报错', () => {
    const page = fillValid(newPage())
    page.onAddressInput({ detail: { value: '' } })
    expect(page.data.errors.address).toBe('请输入房产地址')
    expect(page.data.canSubmit).toBe(false)
  })

  test('A-04: 纯空格地址不算填写', () => {
    const page = newPage()
    page.onAddressInput({ detail: { value: '    ' } })
    expect(page.data.errors.address).toBe('请输入房产地址')
    expect(page.data.canSubmit).toBe(false)
  })

  test('A-05: 地址 + 有效租金 = 可提交', () => {
    const page = newPage()
    page.onAddressInput({ detail: { value: '阳光小区' } })
    page.onRentInput({ detail: { value: '3000' } })
    expect(page.data.canSubmit).toBe(true)
    expect(Object.keys(page.data.errors)).toHaveLength(0)
  })
})

// ============================================
// M系列：月租金
// ============================================
describe('M系列：onRentInput() - 月租金', () => {

  test('M-01: 没填租金', () => {
    const page = newPage()
    page.onAddressInput({ detail: { value: 'A' } })
    page.onRentInput({ detail: { value: '' } })
    expect(page.data.errors.monthlyRent).toBe('请输入月租金')
  })

  test('M-02: 非数字租金', () => {
    const page = newPage()
    page.onAddressInput({ detail: { value: 'A' } })
    page.onRentInput({ detail: { value: 'abc' } })
    expect(page.data.errors.monthlyRent).toBe('请输入有效的租金金额')
  })

  test('M-03: 0 和负数都无效', () => {
    const page = newPage()
    page.onAddressInput({ detail: { value: 'A' } })
    page.onRentInput({ detail: { value: '0' } })
    expect(page.data.errors.monthlyRent).toBe('请输入有效的租金金额')
    page.onRentInput({ detail: { value: '-100' } })
    expect(page.data.errors.monthlyRent).toBe('请输入有效的租金金额')
  })

  test('M-04: 边界值 0.01 视为有效', () => {
    const page = newPage()
    page.onAddressInput({ detail: { value: 'A' } })
    page.onRentInput({ detail: { value: '0.01' } })
    expect(page.data.errors.monthlyRent).toBeUndefined()
    expect(page.data.canSubmit).toBe(true)
  })

  test('M-05: 小数金额有效', () => {
    const page = newPage()
    page.onAddressInput({ detail: { value: 'A' } })
    page.onRentInput({ detail: { value: '3000.50' } })
    expect(page.data.errors.monthlyRent).toBeUndefined()
    expect(page.data.canSubmit).toBe(true)
  })

  test('M-06: 数字后面带字母（12abc）整体判为无效', () => {
    const page = newPage()
    page.onAddressInput({ detail: { value: 'A' } })
    page.onRentInput({ detail: { value: '12abc' } })
    expect(page.data.errors.monthlyRent).toBe('请输入有效的租金金额')
  })

  test.failing('M-07: [缺陷] 纯空格租金应判为无效，当前不报错', () => {
    const page = newPage()
    page.onAddressInput({ detail: { value: 'A' } })
    page.onRentInput({ detail: { value: '  ' } })
    // 现状：isNaN('  ') === false 且 parseFloat('  ') <= 0 也是 false → 漏网，
    // 但 canSubmit 又是 false，校验与按钮状态不一致
    expect(page.data.errors.monthlyRent).toBe('请输入有效的租金金额')
  })
})

// ============================================
// F系列：物业管理费（选填）
// ============================================
describe('F系列：onPropertyFeeInput() - 物业管理费', () => {

  // 注：fillValid() 没填身份证，表单本身就不合法，这里另起一套填满必填项的
  function fillRequired(page) {
    page.setData({
      address: '阳光小区 3-101',
      monthlyRent: '3000',
      tenantName: '张三',
      tenantPhone: '13800138000',
      id: '110101199001011234',
      leaseStart: '2024-01-01',
      leaseEnd: '2024-12-31'
    })
    page.validateForm()
    return page
  }

  test('F-01: 留空不报错，也不影响提交', () => {
    const page = fillRequired(newPage())
    page.onPropertyFeeInput({ detail: { value: '' } })
    expect(page.data.errors.propertyFee).toBeUndefined()
    expect(page.data.canSubmit).toBe(true)
  })

  test('F-02: 填 200 合法', () => {
    const page = fillRequired(newPage())
    page.onPropertyFeeInput({ detail: { value: '200' } })
    expect(page.data.errors.propertyFee).toBeUndefined()
    expect(page.data.canSubmit).toBe(true)
  })

  test('F-03: 填 0 视为合法（免物业费）', () => {
    const page = fillRequired(newPage())
    page.onPropertyFeeInput({ detail: { value: '0' } })
    expect(page.data.errors.propertyFee).toBeUndefined()
    expect(page.data.canSubmit).toBe(true)
  })

  test('F-04: 负数报错并拦住保存', async () => {
    mockCreate.mockResolvedValue({ id: 1 })
    const page = fillRequired(newPage())
    page.onPropertyFeeInput({ detail: { value: '-100' } })
    expect(page.data.errors.propertyFee).toBe('请输入有效的物业费金额')

    await page.saveProperty()

    expect(mockCreate).not.toHaveBeenCalled()
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '请输入有效的物业费金额',
      icon: 'none'
    })
  })

  test('F-05: 保存时原样透传（数字转换交给 repo）', async () => {
    mockCreate.mockResolvedValue({ id: 1 })
    const page = fillRequired(newPage())
    page.onPropertyFeeInput({ detail: { value: '200' } })

    await page.saveProperty()

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate.mock.calls[0][0].propertyFee).toBe('200')
  })

  test('F-06: 没填时透传空字符串', async () => {
    mockCreate.mockResolvedValue({ id: 1 })
    const page = fillRequired(newPage())

    await page.saveProperty()

    expect(mockCreate.mock.calls[0][0].propertyFee).toBe('')
  })

  test('F-07: WXML 绑定的 onPropertyFeeInput 页面已实现', () => {
    const wxml = fs.readFileSync(WXML_PATH, 'utf8')
    expect(wxml).toContain('bindinput="onPropertyFeeInput"')
    expect(typeof pageConfig.onPropertyFeeInput).toBe('function')
  })
})

// ============================================
// N系列：选填字段（姓名 / 电话 / 身份证 / 备注）
// ============================================
describe('N系列：选填字段输入', () => {

  test('N-01: 租客姓名只写入，不触发校验', () => {
    const page = newPage()
    page.onTenantNameInput({ detail: { value: '张三' } })
    expect(page.data.tenantName).toBe('张三')
    expect(page.data.errors).toEqual({})
    expect(page.data.canSubmit).toBe(false)
  })

  test('N-02: 备注只写入，不触发校验', () => {
    const page = newPage()
    page.onRemarkInput({ detail: { value: '押一付三' } })
    expect(page.data.remark).toBe('押一付三')
    expect(page.data.errors).toEqual({})
  })

  test('N-03: 手机号只写入，错误要等下一次校验才出现', () => {
    const page = newPage()
    page.onTenantPhoneInput({ detail: { value: '123' } })
    expect(page.data.tenantPhone).toBe('123')
    expect(page.data.errors.tenantPhone).toBeUndefined()
    page.onAddressInput({ detail: { value: 'A' } }) // 触发校验
    expect(page.data.errors.tenantPhone).toBe('请输入有效的手机号码')
  })

  test.failing('N-04: [缺陷] 身份证号应做格式校验，当前 validateForm 完全不校验', () => {
    const page = fillValid(newPage())
    page.onIdInput({ detail: { value: '123' } })
    expect(page.data.errors.tenantIdCard).toBeDefined()
  })
})

// ============================================
// P系列：手机号校验规则
// ============================================
describe('P系列：validateForm() - 手机号规则 /^1[3-9]\\d{9}$/', () => {

  const valid = ['13800138000', '15012345678', '19900001111', '17712345678']
  const invalid = [
    '12800138000',   // 第二位不在 3-9
    '10800138000',
    '23800138000',   // 不是 1 开头
    '1380013800',    // 只有 10 位
    '138001380000',  // 12 位
    '1380013800a',
    '138 0013 8000', // 带空格，不做 trim
    ' 13800138000'
  ]

  test.each(valid)('P-01: 合法号码 %s 通过', (phone) => {
    const page = fillValid(newPage())
    page.setData({ tenantPhone: phone })
    expect(page.validateForm()).toBe(true)
    expect(page.data.errors.tenantPhone).toBeUndefined()
  })

  test.each(invalid)('P-02: 非法号码 %s 报错', (phone) => {
    const page = fillValid(newPage())
    page.setData({ tenantPhone: phone })
    expect(page.validateForm()).toBe(false)
    expect(page.data.errors.tenantPhone).toBe('请输入有效的手机号码')
  })

  test('P-03: 手机号选填，留空不报错', () => {
    const page = fillValid(newPage())
    page.setData({ tenantPhone: '' })
    expect(page.validateForm()).toBe(true)
    expect(page.data.errors.tenantPhone).toBeUndefined()
  })
})

// ============================================
// L系列：租期
// ============================================
describe('L系列：onLeaseStartChange() / onLeaseEndChange()', () => {

  test('L-01: 开始日期晚于已有结束日期 → 清空结束日期', () => {
    const page = newPage()
    page.setData({ leaseEnd: '2024-06-30' })
    page.onLeaseStartChange({ detail: { value: '2024-07-01' } })
    expect(page.data.leaseStart).toBe('2024-07-01')
    expect(page.data.leaseEnd).toBe('')
  })

  test('L-02: 开始日期早于结束日期 → 保留结束日期', () => {
    const page = newPage()
    page.setData({ leaseEnd: '2024-06-30' })
    page.onLeaseStartChange({ detail: { value: '2024-01-01' } })
    expect(page.data.leaseEnd).toBe('2024-06-30')
  })

  test('L-03: 起止同一天 → 保留（边界不算倒挂）', () => {
    const page = newPage()
    page.setData({ leaseEnd: '2024-06-30' })
    page.onLeaseStartChange({ detail: { value: '2024-06-30' } })
    expect(page.data.leaseEnd).toBe('2024-06-30')
  })

  test('L-04: 还没选结束日期时不清空', () => {
    const page = newPage()
    page.onLeaseStartChange({ detail: { value: '2024-07-01' } })
    expect(page.data.leaseEnd).toBe('')
  })

  test('L-05: 选结束日期只写入，不做任何联动', () => {
    const page = newPage()
    page.setData({ leaseStart: '2024-01-01' })
    page.onLeaseEndChange({ detail: { value: '2023-01-01' } })
    expect(page.data.leaseEnd).toBe('2023-01-01')
    expect(page.data.leaseStart).toBe('2024-01-01')
  })

  test('L-06: 结束早于开始 → 校验报错', () => {
    const page = fillValid(newPage())
    page.setData({ leaseStart: '2024-06-01', leaseEnd: '2024-05-01' })
    expect(page.validateForm()).toBe(false)
    expect(page.data.errors.leaseDates).toBe('结束日期不能早于开始日期')
  })

  test('L-07: 起止相同 → 不报错', () => {
    const page = fillValid(newPage())
    page.setData({ leaseStart: '2024-06-01', leaseEnd: '2024-06-01' })
    expect(page.validateForm()).toBe(true)
  })

  test('L-08: 只填一头不校验日期区间', () => {
    const page = fillValid(newPage())
    page.setData({ leaseStart: '', leaseEnd: '2024-05-01' })
    expect(page.validateForm()).toBe(true)
  })
})

// ============================================
// V系列：validateForm() 整体行为
// ============================================
describe('V系列：validateForm() - 整体行为', () => {

  test('V-01: 全空表单 → 地址和租金都报错', () => {
    const page = newPage()
    expect(page.validateForm()).toBe(false)
    expect(page.data.errors.address).toBe('请输入房产地址')
    expect(page.data.errors.monthlyRent).toBe('请输入月租金')
  })

  test('V-02: 全部合法 → 返回 true 且错误为空', () => {
    const page = fillValid(newPage())
    expect(page.validateForm()).toBe(true)
    expect(page.data.errors).toEqual({})
    expect(page.data.canSubmit).toBe(true)
  })

  test('V-03: errors 每次整体重建，改对了旧错误会消失', () => {
    const page = newPage()
    expect(page.data.errors.address).toBeUndefined()
    page.validateForm()
    expect(page.data.errors.address).toBe('请输入房产地址')
    page.onAddressInput({ detail: { value: '阳光小区' } })
    page.onRentInput({ detail: { value: '3000' } })
    expect(page.data.errors.address).toBeUndefined()
    expect(page.data.errors).toEqual({})
  })

  test('V-04: 日期倒挂不影响 canSubmit（按钮仍可点，靠 save 兜底）', () => {
    const page = fillValid(newPage())
    page.setData({ leaseStart: '2024-06-01', leaseEnd: '2024-05-01' })
    page.validateForm()
    expect(page.data.canSubmit).toBe(true)
    expect(page.validateForm()).toBe(false)
  })
})

// ============================================
// S系列：保存
// ============================================
describe('S系列：saveProperty() - 保存房产', () => {

  test('S-01: 校验失败 → 不保存、不 loading、不返回', async () => {
    const page = newPage()
    await page.saveProperty()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(global.wx.showLoading).not.toHaveBeenCalled()
    expect(global.wx.navigateBack).not.toHaveBeenCalled()
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '请输入房产地址',
      icon: 'none'
    })
  })

  test('S-02: 保存成功 → loading → 成功 toast → 1.5s 后返回上一页', async () => {
    jest.useFakeTimers()
    mockCreate.mockResolvedValue({ id: 1 })
    const page = fillValid(newPage())

    await page.saveProperty()

    expect(global.wx.showLoading).toHaveBeenCalledWith({ title: '保存中...', mask: true })
    expect(global.wx.hideLoading).toHaveBeenCalledTimes(1)
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '添加成功',
      icon: 'success',
      duration: 1500
    })
    expect(global.wx.navigateBack).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1500)
    expect(global.wx.navigateBack).toHaveBeenCalledTimes(1)
  })

  test('S-03: repo 写入失败（返回 null）→ 失败 toast，不返回上一页', async () => {
    jest.useFakeTimers()
    mockCreate.mockResolvedValue(null)
    const page = fillValid(newPage())

    await page.saveProperty()

    expect(global.wx.hideLoading).toHaveBeenCalledTimes(1)
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '保存失败，请重试',
      icon: 'none'
    })
    jest.advanceTimersByTime(3000)
    expect(global.wx.navigateBack).not.toHaveBeenCalled()
  })

  test('S-04: 传给 propertyRepo.create 的字段完整且原样透传', async () => {
    mockCreate.mockResolvedValue({ id: 1 })
    const page = fillValid(newPage())

    await page.saveProperty()

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledWith({
      address: '阳光小区 3-101',
      monthlyRent: '3000',
      propertyFee: '',
      tenantName: '张三',
      tenantPhone: '13800138000',
      leaseStart: '2024-01-01',
      leaseEnd: '2024-12-31',
      remark: '押一付三'
    })
  })

  test('S-05: 地址两侧空格交给 repo 处理，页面不改数据', async () => {
    mockCreate.mockResolvedValue({ id: 1 })
    const page = fillValid(newPage())
    page.onAddressInput({ detail: { value: '  幸福里 1-101  ' } })

    await page.saveProperty()

    expect(mockCreate.mock.calls[0][0].address).toBe('  幸福里 1-101  ')
  })

  test('S-06: 手机号非法会拦住保存（哪怕按钮是亮的）', async () => {
    const page = fillValid(newPage())
    page.setData({ tenantPhone: '123' })
    expect(page.data.canSubmit).toBe(true)

    await page.saveProperty()

    expect(mockCreate).not.toHaveBeenCalled()
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '请输入有效的手机号码',
      icon: 'none'
    })
  })

  test('S-07: 租期倒挂会拦住保存', async () => {
    const page = fillValid(newPage())
    page.setData({ leaseStart: '2024-06-01', leaseEnd: '2024-05-01' })

    await page.saveProperty()

    expect(mockCreate).not.toHaveBeenCalled()
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '结束日期不能早于开始日期',
      icon: 'none'
    })
  })

  test('S-08: ⚠️ create 抛异常时没有 try/catch，loading 不会关闭', async () => {
    mockCreate.mockRejectedValue(new Error('boom'))
    const page = fillValid(newPage())

    await expect(page.saveProperty()).rejects.toThrow('boom')
    expect(global.wx.showLoading).toHaveBeenCalledTimes(1)
    expect(global.wx.hideLoading).not.toHaveBeenCalled()
  })
})

// ============================================
// E系列：错误提示优先级
// ============================================
describe('E系列：showValidationError() - 提示优先级', () => {

  function toastTitle(page) {
    global.wx.showToast.mockClear()
    page.showValidationError()
    return global.wx.showToast.mock.calls[0]?.[0]?.title
  }

  test('E-01: 地址错误优先级最高', () => {
    const page = newPage()
    page.setData({
      errors: {
        address: '请输入房产地址',
        monthlyRent: '请输入月租金',
        tenantPhone: '请输入有效的手机号码',
        leaseDates: '结束日期不能早于开始日期'
      }
    })
    expect(toastTitle(page)).toBe('请输入房产地址')
    expect(global.wx.showToast).toHaveBeenCalledTimes(1)
  })

  test('E-02: 地址没错时提示租金', () => {
    const page = newPage()
    page.setData({
      errors: { monthlyRent: '请输入月租金', tenantPhone: '请输入有效的手机号码' }
    })
    expect(toastTitle(page)).toBe('请输入月租金')
  })

  test('E-03: 轮到手机号', () => {
    const page = newPage()
    page.setData({
      errors: { tenantPhone: '请输入有效的手机号码', leaseDates: '结束日期不能早于开始日期' }
    })
    expect(toastTitle(page)).toBe('请输入有效的手机号码')
  })

  test('E-04: 只剩日期错误时提示日期', () => {
    const page = newPage()
    page.setData({ errors: { leaseDates: '结束日期不能早于开始日期' } })
    expect(toastTitle(page)).toBe('结束日期不能早于开始日期')
  })

  test('E-05: 没有错误不弹 toast', () => {
    const page = newPage()
    page.setData({ errors: {} })
    global.wx.showToast.mockClear()
    page.showValidationError()
    expect(global.wx.showToast).not.toHaveBeenCalled()
  })
})

// ============================================
// G系列：取消
// ============================================
describe('G系列：goBack()', () => {
  test('G-01: 取消直接返回上一页', () => {
    const page = newPage()
    page.goBack()
    expect(global.wx.navigateBack).toHaveBeenCalledTimes(1)
  })
})

// ============================================
// W系列：WXML 与 JS 的接线 / 已知缺陷
// ============================================
describe('W系列：WXML 事件接线与身份证字段', () => {

  const wxml = fs.readFileSync(WXML_PATH, 'utf8')
  const handlers = [...wxml.matchAll(/bind(?:input|change|tap)="([A-Za-z0-9_]+)"/g)]
    .map((m) => m[1])

  test('W-01: WXML 里绑定的事件（除身份证）页面都已实现', () => {
    expect(handlers).toContain('onAddressInput')
    expect(handlers).toContain('onRentInput')
    expect(handlers).toContain('saveProperty')
    handlers
      .filter((h) => h !== 'onTenantIdCardInput')
      .forEach((h) => {
        expect(typeof pageConfig[h]).toBe('function')
      })
  })

  test.failing('W-02: [缺陷] 身份证输入框绑定的 onTenantIdCardInput 未实现（JS 里叫 onIdInput）', () => {
    expect(handlers).toContain('onTenantIdCardInput')
    expect(typeof pageConfig.onTenantIdCardInput).toBe('function')
  })

  test.failing('W-03: [缺陷] data 里没有 tenantIdCard 初始值，WXML 的 value 绑定取不到', () => {
    expect(pageConfig.data.tenantIdCard).toBe('')
  })

  test.failing('W-04: [缺陷] 填了身份证也不会存进 propertyRepo', async () => {
    mockCreate.mockResolvedValue({ id: 1 })
    const page = fillValid(newPage())
    page.onIdInput({ detail: { value: '110101199001011234' } })

    await page.saveProperty()

    expect(mockCreate.mock.calls[0][0].tenantIdCard).toBe('110101199001011234')
  })
})
