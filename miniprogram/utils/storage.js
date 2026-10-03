/**
 * 本地存储统一出口（门1：全项目唯一读写通道）
 *
 * 约定：
 * 1. 任何页面/页面级代码都不再直接调用 wx.getStorage / wx.setStorage，
 *    必须通过本文件或 property-repo。
 * 2. 读失败返回兜底值（不 reject）；写失败返回 false（必须 reject Promise 之外的信号），
 *    绝不出现「既不成功也不失败、await 永远挂着」的情况。
 * 3. 所有 storage key 集中在此处，避免散落字符串写错。
 */

const KEYS = {
  PROPERTIES: 'properties'
  // 下一期多租客：TENANTS / LEASES / BILLS / FEE_RULES
}

/**
 * 当前运行环境是否有微信 API（跑单测时为 false）
 */
function hasWX() {
  return typeof wx !== 'undefined' && wx && typeof wx.getStorage === 'function'
}

/**
 * 读取一个 key
 * @param {string} key
 * @param {*} fallback 读不到（含出错）时返回的兜底值
 * @returns {Promise<*>}
 */
function read(key, fallback = null) {
  if (!hasWX()) return Promise.resolve(fallback)
  return new Promise((resolve) => {
    wx.getStorage({
      key,
      success: (res) => resolve(res.data === undefined || res.data === null ? fallback : res.data),
      fail: () => resolve(fallback)
    })
  })
}

/**
 * 写入一个 key
 * @param {string} key
 * @param {*} data
 * @returns {Promise<boolean>} 成功 true，失败 false（永不挂起）
 */
function write(key, data) {
  if (!hasWX()) return Promise.resolve(false)
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
  if (!hasWX()) return Promise.resolve(false)
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
