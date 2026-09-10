/**
 * 房产数据服务：封装所有 storage 读写
 */

// ============ 基础读写 ============

function getAllProperties() {
  return new Promise((resolve) => {
    wx.getStorage({
      key: 'properties',
      success: (res) => resolve(res.data || []),
      fail: () => resolve([])
    })
  })
}

function saveProperties(properties) {
  return new Promise((resolve) => {
    wx.setStorage({
      key: 'properties',
      data: properties,
      success: () => resolve(true)
    })
  })
}

// ============ 收租 / 撤销 ============

/**
 * 确认收租
 */
async function collectRent(propertyId, year, month, amount) {
  const properties = await getAllProperties()
  const index = properties.findIndex(p => p.id === propertyId)
  if (index === -1) return false
  
  if (!properties[index].paymentHistory) {
    properties[index].paymentHistory = []
  }
  
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`
  
  const existingIndex = properties[index].paymentHistory.findIndex(
    p => p.year === year && p.month === month
  )
  
  if (existingIndex !== -1) {
    properties[index].paymentHistory[existingIndex].status = 'paid'
    properties[index].paymentHistory[existingIndex].date = dateStr
    properties[index].paymentHistory[existingIndex].amount = amount
  } else {
    properties[index].paymentHistory.push({
      year, month, status: 'paid', date: dateStr, amount
    })
  }
  
  recalcTotal(properties[index])
  properties[index].updatedAt = dateStr
  
  await saveProperties(properties)
  return true
}

/**
 * 撤销收租
 */
async function cancelRent(propertyId, year, month) {
  const properties = await getAllProperties()
  const index = properties.findIndex(p => p.id === propertyId)
  if (index === -1) return false
  
  const paymentIndex = properties[index].paymentHistory?.findIndex(
    p => p.year === year && p.month === month
  )
  
  if (paymentIndex === undefined || paymentIndex === -1) return false
  
  properties[index].paymentHistory[paymentIndex].status = 'unpaid'
  properties[index].paymentHistory[paymentIndex].date = null
  
  recalcTotal(properties[index])
  properties[index].updatedAt = new Date().toISOString()
  
  await saveProperties(properties)
  return true
}

/**
 * 重新计算累计已收租金
 */
function recalcTotal(property) {
  let total = 0
  ;(property.paymentHistory || []).forEach(p => {
    if (p.status === 'paid') {
      total += p.amount || property.monthlyRent
    }
  })
  property.totalReceivedRent = total
}

/**
 * 更新房产信息
 */
async function updateProperty(propertyId, form) {
  const properties = await getAllProperties()
  const index = properties.findIndex(p => p.id === propertyId)
  if (index === -1) return false
  
  properties[index] = {
    ...properties[index],
    ...form,
    monthlyRent: parseFloat(form.monthlyRent),
    updatedAt: new Date().toISOString()
  }
  
  await saveProperties(properties)
  return true
}

/**
 * 删除房产
 */
async function deleteProperty(propertyId) {
  const properties = await getAllProperties()
  const newProperties = properties.filter(p => p.id !== propertyId)
  await saveProperties(newProperties)
  return true
}

module.exports = {
  getAllProperties,
  saveProperties,
  collectRent,
  cancelRent,
  updateProperty,
  deleteProperty
}