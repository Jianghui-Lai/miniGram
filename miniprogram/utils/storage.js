/**
 * 本地存储统一出口（全项目唯一读写通道）
 *
 * 约定：
 * 1. 任何页面/页面级代码都不再直接调用 wx.getStorage / wx.setStorage，
 *    必须通过本文件或 property-repo。
 * 2. 读失败返回兜底值（不 reject）；写失败返回 false（不挂起）。
 * 3. 所有 storage key 集中在此处。
 */

const KEYS = {
  PROPERTIES: 'properties',
  TENANTS: 'tenants',
  LEASES: 'leases',
  BILLS: 'monthlyBills',
  FEE_RULES: 'propertyFeeRules'
}

// 非 WX 环境（单测）用内存模拟
const memoryStore = {}

function hasWX() {
  return typeof wx !== 'undefined' && wx && typeof wx.getStorage === 'function'
}

/**
 * 读取一个 key
 * @param {string} key
 * @param {*} fallback 读不到时返回的兜底值
 * @returns {Promise<*>}
 */
function read(key, fallback = null) {
  if (!hasWX()) {
    return Promise.resolve(key in memoryStore ? memoryStore[key] : fallback)
  }
  return new Promise((resolve) => {
    wx.getStorage({
      key,
      success: (res) => resolve(res.data),
      fail: () => resolve(fallback)
    })
  })
}

/**
 * 写入一个 key
 * @param {string} key
 * @param {*} data
 * @returns {Promise<boolean>}
 */
function write(key, data) {
  if (!hasWX()) {
    memoryStore[key] = data
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    wx.setStorage({
      key,
      data,
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

/**
 * 删除一个 key
 * @param {string} key
 * @returns {Promise<boolean>}
 */
function remove(key) {
  if (!hasWX()) {
    delete memoryStore[key]
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    wx.removeStorage({
      key,
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

module.exports = {
  KEYS,
  read,
  write,
  remove
}