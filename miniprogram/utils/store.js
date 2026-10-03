/**
 * 通用数据仓库 —— 【下一期专用，本轮不接线】
 *
 * 用途：为「一套房多个租客」提前备好的五张表（properties / tenants / leases / bills / feeRules）。
 * 当前线上版本仍是「一套房一个租客」，真实读写请走 utils/property-repo.js。
 * 迁移时机：开始做多租客时，把 store.js 作为底层存储，在其上长出新 repo，
 *          本文件与 bill-manager.js 一起接线，其余页面零感知。
 *
 * 封装所有实体的本地存储读写
 */

// ============ 存储键名 ============
const KEYS = {
  PROPERTIES: 'properties',       // 房产
  TENANTS: 'tenants',             // 租客
  LEASES: 'leases',               // 租约
  BILLS: 'monthlyBills',          // 月度账单
  FEE_RULES: 'propertyFeeRules'   // 物业费规则
}

// ============ 基础读写 ============

/**
 * 获取某个键的列表
 * @param {string} key - KEYS 中的键名
 * @returns {Array}
 */
function getList(key) {
  try {
    const data = wx.getStorageSync(key)
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.error(`[store] getList(${key}) 失败:`, e)
    return []
  }
}

/**
 * 保存某个键的列表
 * @param {string} key
 * @param {Array} list
 * @returns {boolean}
 */
function setList(key, list) {
  try {
    wx.setStorageSync(key, list)
    return true
  } catch (e) {
    console.error(`[store] setList(${key}) 失败:`, e)
    return false
  }
}

/**
 * 根据 ID 查找
 * @param {string} key
 * @param {string|number} id
 * @returns {Object|null}
 */
function findById(key, id) {
  const list = getList(key)
  return list.find(item => item.id === id) || null
}

/**
 * 根据条件查找
 * @param {string} key
 * @param {Function} predicate
 * @returns {Array}
 */
function findWhere(key, predicate) {
  const list = getList(key)
  return list.filter(predicate)
}

/**
 * 新增或更新（按 id 判断）
 * @param {string} key
 * @param {Object} item
 * @returns {Object} 保存后的 item
 */
function upsert(key, item) {
  const list = getList(key)
  const index = list.findIndex(x => x.id === item.id)
  
  const now = new Date().toISOString()
  
  if (index === -1) {
    // 新增
    const newItem = {
      ...item,
      createdAt: item.createdAt || now,
      updatedAt: now
    }
    list.push(newItem)
    setList(key, list)
    return newItem
  } else {
    // 更新
    const updatedItem = {
      ...list[index],
      ...item,
      updatedAt: now
    }
    list[index] = updatedItem
    setList(key, list)
    return updatedItem
  }
}

/**
 * 根据 ID 删除
 * @param {string} key
 * @param {string|number} id
 * @returns {boolean}
 */
function remove(key, id) {
  const list = getList(key)
  const newList = list.filter(item => item.id !== id)
  return setList(key, newList)
}

/**
 * 批量删除（按条件）
 * @param {string} key
 * @param {Function} predicate
 * @returns {number} 删除数量
 */
function removeWhere(key, predicate) {
  const list = getList(key)
  const newList = list.filter(item => !predicate(item))
  const removedCount = list.length - newList.length
  setList(key, newList)
  return removedCount
}

/**
 * 生成唯一 ID
 * @param {string} prefix - 如 'p' (property), 't' (tenant), 'l' (lease), 'b' (bill)
 * @returns {string}
 */
function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
}

// ============ 清空（用于调试） ============

/**
 * 清空所有数据（慎用）
 */
function clearAll() {
  Object.values(KEYS).forEach(key => {
    wx.removeStorageSync(key)
  })
}

// ============ 导出 ============

module.exports = {
  KEYS,
  getList,
  setList,
  findById,
  findWhere,
  upsert,
  remove,
  removeWhere,
  generateId,
  clearAll
}