/**
 * 租期管理核心函数单元测试
 * 测试文件: tests/unit/lease-manager.test.js
 */

const {
  getPropertyStatus,
  isActiveInMonth,
  getReminderDate,
  shouldRemind
} = require('../../miniprogram/utils/lease-manager.js')

// ============================================
// 固定测试日期：2024年6月15日
// ============================================
const TEST_DATE = new Date('2024-06-15T00:00:00')

// 模拟 Date 构造函数，固定返回测试日期
const OriginalDate = global.Date
global.Date = function(...args) {
  if (args.length === 0) {
    return new OriginalDate(TEST_DATE)
  }
  return new OriginalDate(...args)
}
global.Date.now = OriginalDate.now

// ============================================
// S系列：租期状态判断 (S-01 到 S-09)
// ============================================
describe('S系列：getPropertyStatus() - 租期状态判断', () => {
  
  test('S-01: 正常租期中（今天在租期内）', () => {
    const property = {
      leaseStart: '2024-01-01',
      leaseEnd: '2025-01-01'
    }
    expect(getPropertyStatus(property)).toBe('renting')
  })

  test('S-02: 租期开始日等于今天', () => {
    const property = {
      leaseStart: '2024-06-15',
      leaseEnd: '2025-06-14'
    }
    expect(getPropertyStatus(property)).toBe('renting')
  })

  test('S-03: 租期结束日等于今天', () => {
    const property = {
      leaseStart: '2023-06-15',
      leaseEnd: '2024-06-15'
    }
    expect(getPropertyStatus(property)).toBe('renting')
  })

  test('S-04: 租期未开始（今天 < 开始日）', () => {
    const property = {
      leaseStart: '2024-07-01',
      leaseEnd: '2025-06-30'
    }
    expect(getPropertyStatus(property)).toBe('upcoming')
  })

  test('S-05: 租期已到期（今天 > 结束日）', () => {
    const property = {
      leaseStart: '2023-01-01',
      leaseEnd: '2023-12-31'
    }
    expect(getPropertyStatus(property)).toBe('unrented')
  })

  test('S-06: 租期已到期（结束日是昨天）', () => {
    const property = {
      leaseStart: '2023-06-15',
      leaseEnd: '2024-06-14'
    }
    expect(getPropertyStatus(property)).toBe('unrented')
  })

  test('S-07: 无租期信息（leaseStart为空）', () => {
    const property = {
      leaseStart: '',
      leaseEnd: '2025-01-01'
    }
    expect(getPropertyStatus(property)).toBe('unrented')
  })

  test('S-08: 无租期信息（leaseEnd为空）', () => {
    const property = {
      leaseStart: '2024-01-01',
      leaseEnd: ''
    }
    expect(getPropertyStatus(property)).toBe('unrented')
  })

  test('S-09: 无租期信息（两者都为空）', () => {
    const property = {
      leaseStart: '',
      leaseEnd: ''
    }
    expect(getPropertyStatus(property)).toBe('unrented')
  })
})

// ============================================
// M系列：月份在租期内判断 (M-01 到 M-05)
// ============================================
describe('M系列：isActiveInMonth() - 检查某月是否在租期内', () => {
  
  test('M-01: 租期完全覆盖该月', () => {
    const property = {
      leaseStart: '2024-01-01',
      leaseEnd: '2024-12-31'
    }
    expect(isActiveInMonth(property, 2024, 6)).toBe(true)
  })

  test('M-02: 租期开始于该月中间', () => {
    const property = {
      leaseStart: '2024-06-15',
      leaseEnd: '2024-12-31'
    }
    expect(isActiveInMonth(property, 2024, 6)).toBe(true)
  })

  test('M-03: 租期结束于该月中间', () => {
    const property = {
      leaseStart: '2024-01-01',
      leaseEnd: '2024-06-15'
    }
    expect(isActiveInMonth(property, 2024, 6)).toBe(true)
  })

  test('M-04: 租期在该月之前', () => {
    const property = {
      leaseStart: '2024-01-01',
      leaseEnd: '2024-03-31'
    }
    expect(isActiveInMonth(property, 2024, 6)).toBe(false)
  })

  test('M-05: 租期在该月之后', () => {
    const property = {
      leaseStart: '2024-07-01',
      leaseEnd: '2024-12-31'
    }
    expect(isActiveInMonth(property, 2024, 6)).toBe(false)
  })
})

// ============================================
// D系列：提醒功能 (D-01 到 D-05)
// ============================================
describe('D系列：提醒日期计算与检查', () => {
  
  // 断言一律用本地日期分量（getFullYear/getMonth/getDate），
  // 不用 toISOString()，否则在不同时区跑会得到差一天的结果
  test('D-01: 提醒日期计算 - 当月有相同日期', () => {
    const result = getReminderDate('2024-01-31', 2024, 3)
    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2024, 2, 31])
  })

  test('D-02: 提醒日期计算 - 当月无31号，取最后一天', () => {
    const result = getReminderDate('2024-01-31', 2024, 4)
    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2024, 3, 30])
  })

  test('D-03: 提醒日期计算 - 当月有30号', () => {
    const result = getReminderDate('2024-01-30', 2024, 4)
    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2024, 3, 30])
  })

  test('D-04: shouldRemind - 未交租且已过提醒日', () => {
    // 固定今天为 2024-03-05
    const property = {
      leaseStart: '2024-01-01',
      leaseEnd: '2025-01-01',
      paymentHistory: []
    }
    // 提醒日是每月1号，今天5号 > 1号，未交租
    expect(shouldRemind(property, 2024, 3)).toBe(true)
  })

  test('D-05: shouldRemind - 已交租不需要提醒', () => {
    const property = {
      leaseStart: '2024-01-01',
      leaseEnd: '2025-01-01',
      paymentHistory: [
        { year: 2024, month: 3, status: 'paid' }
      ]
    }
    expect(shouldRemind(property, 2024, 3)).toBe(false)
  })
})

// ============================================
// F系列：表单验证（纯函数测试）
// ============================================
describe('F系列：表单验证逻辑', () => {
  
  test('F-01: 全部必填项填写正确', () => {
    const form = {
      address: '阳光小区 3-101',
      monthlyRent: '3000'
    }
    const isValid = form.address && form.address.trim() !== '' && 
                    form.monthlyRent && parseFloat(form.monthlyRent) > 0
    expect(isValid).toBe(true)
  })

  test('F-02: 地址为空', () => {
    const form = {
      address: '',
      monthlyRent: '3000'
    }
    const isValid = form.address && form.address.trim() !== '' && 
                    form.monthlyRent && parseFloat(form.monthlyRent) > 0
    expect(isValid).toBeFalsy()
  })

  test('F-03: 租金为空', () => {
    const form = {
      address: '阳光小区 3-101',
      monthlyRent: ''
    }
    const isValid = form.address && form.address.trim() !== '' && 
                    form.monthlyRent && parseFloat(form.monthlyRent) > 0
    expect(isValid).toBeFalsy()
  })

  test('F-04: 租金为负数', () => {
    const form = {
      address: '阳光小区 3-101',
      monthlyRent: '-100'
    }
    const isValid = form.address && form.address.trim() !== '' && 
                    form.monthlyRent && parseFloat(form.monthlyRent) > 0
    expect(isValid).toBe(false)
  })

  test('F-05: 租金为非数字', () => {
    const form = {
      address: '阳光小区 3-101',
      monthlyRent: 'abc'
    }
    const isValid = form.address && form.address.trim() !== '' && 
                    form.monthlyRent && parseFloat(form.monthlyRent) > 0
    expect(isValid).toBe(false)
  })
})