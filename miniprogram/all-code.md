# 小程序代码提取

生成时间: Sun Apr 12 20:26:01 CST 2026

## 📁 app.js

```javascript
// app.js
App({
  onLaunch() {
    // 初始化示例数据（如果没有数据）
    this.initSampleData()
  },

  initSampleData() {
    wx.getStorage({
      key: 'properties',
      success: (res) => {
        if (!res.data || res.data.length === 0) {
          this.loadSampleData()
        }
      },
      fail: () => {
        this.loadSampleData()
      }
    })
  }}

## 📁 utils/

### 📄 `utils/lease-manager.js`

```javascript
/**
 * 租期管理核心工具
 */

// 状态常量
const STATUS = {
  RENTING: 'renting',     // 出租中
  UPCOMING: 'upcoming',   // 即将出租
  UNRENTED: 'unrented'    // 未租
}

const STATUS_TEXT = {
  [STATUS.RENTING]: '出租中',
  [STATUS.UPCOMING]: '即将出租',
  [STATUS.UNRENTED]: '未租'
}

/**
 * 获取房产状态（基于租期）
 */
function getPropertyStatus(property) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const hasCompleteLease = property.leaseStart && 
                           property.leaseStart.trim() !== '' && 
                           property.leaseEnd && 
                           property.leaseEnd.trim() !== ''
  
  if (!hasCompleteLease) {
    return STATUS.UNRENTED
  }
  
  const leaseStart = new Date(property.leaseStart)
  const leaseEnd = new Date(property.leaseEnd)
  leaseEnd.setHours(23, 59, 59, 999)
  
  if (today < leaseStart) {
    return STATUS.UPCOMING
  }
  
  if (today > leaseEnd) {
    return STATUS.UNRENTED
  }
  
  return STATUS.RENTING
}

/**
 * 检查房产是否在某月处于出租状态
 */
function isActiveInMonth(property, year, month) {
  if (!property.leaseStart || !property.leaseEnd) {
    return false
  }
  
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0, 23, 59, 59)
  
  const leaseStart = new Date(property.leaseStart)
  const leaseEnd = new Date(property.leaseEnd)
  leaseEnd.setHours(23, 59, 59, 999)
  
  return leaseStart <= monthEnd && leaseEnd >= monthStart
}

/**
 * 获取某月的应收租金
 */
function getRentForMonth(property, year, month) {
  if (!isActiveInMonth(property, year, month)) {
    return 0
  }
  return property.monthlyRent || 0
}

/**
 * 获取房产的月度交租状态（用于年历）
 */
function getMonthlyPaymentStatus(property, year) {
  const months = []
  for (let month = 1; month <= 12; month++) {
    const payment = property.paymentHistory?.find(p => p.year === year && p.month === month)
    months.push({
      month,
      isPaid: payment ? payment.status === 'paid' : false,
      date: payment?.date || null
    })
  }
  return months
}

/**
 * 计算提醒日期（每月固定日期）
 */
function getReminderDate(leaseStart, year, month) {
  const startDate = new Date(leaseStart)
  const dayOfMonth = startDate.getDate()
  
  let reminderDate = new Date(year, month - 1, dayOfMonth)
  
  // 如果当月没有这一天，取当月最后一天
  if (reminderDate.getMonth() !== month - 1) {
    reminderDate = new Date(year, month, 0)
  }
  
  return reminderDate
}

/**
 * 检查本月是否已过提醒日但未交租
 */
function shouldRemind(property, currentYear, currentMonth) {
  if (!property.leaseStart || !property.leaseEnd) {
    return false
  }
  
  const today = new Date()
  const status = getPropertyStatus(property)
  
  if (status !== STATUS.RENTING) {
    return false
  }
  
  const payment = property.paymentHistory?.find(p => p.year === currentYear && p.month === currentMonth)
  if (payment?.status === 'paid') {
    return false
  }
  
  const reminderDate = getReminderDate(property.leaseStart, currentYear, currentMonth)
  
  return today >= reminderDate
}

module.exports = {
  STATUS,
  STATUS_TEXT,
  getPropertyStatus,
  isActiveInMonth,
  getRentForMonth,
  getMonthlyPaymentStatus,
  getReminderDate,
  shouldRemind
}```

## 📁 pages/

### 📄 `pages/add-property/add-property.js`

```javascript
Page({
  data: {
    address: '',
    monthlyRent: '',
    tenantName: '',
    tenantPhone: '',
    leaseStart: '',
    leaseEnd: '',
    remark: '',
    canSubmit: false,
    errors: {}
  },

  onAddressInput(e) {
    this.setData({ address: e.detail.value })
    this.validateForm()
  },

  onRentInput(e) {
    this.setData({ monthlyRent: e.detail.value })
    this.validateForm()
  },

  onTenantNameInput(e) {
    this.setData({ tenantName: e.detail.value })
  },

  onTenantPhoneInput(e) {
    this.setData({ tenantPhone: e.detail.value })
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  onLeaseStartChange(e) {
    this.setData({ leaseStart: e.detail.value })
    if (this.data.leaseEnd && this.data.leaseEnd < e.detail.value) {
      this.setData({ leaseEnd: '' })
    }
  },

  onLeaseEndChange(e) {
    this.setData({ leaseEnd: e.detail.value })
  },

  validateForm() {
    const { address, monthlyRent, tenantPhone, leaseStart, leaseEnd } = this.data
    const errors = {}
    
    if (!address || address.trim() === '') {
      errors.address = '请输入房产地址'
    }
    
    if (!monthlyRent) {
      errors.monthlyRent = '请输入月租金'
    } else if (isNaN(monthlyRent) || parseFloat(monthlyRent) <= 0) {
      errors.monthlyRent = '请输入有效的租金金额'
    }
    
    if (tenantPhone) {
      const phoneRegex = /^1[3-9]\d{9}$/
      if (!phoneRegex.test(tenantPhone)) {
        errors.tenantPhone = '请输入有效的手机号码'
      }
    }
    
    if (leaseStart && leaseEnd && leaseEnd < leaseStart) {
      errors.leaseDates = '结束日期不能早于开始日期'
    }
    
    this.setData({ errors })
    
    const canSubmit = address && address.trim() !== '' && 
                      monthlyRent && parseFloat(monthlyRent) > 0
    this.setData({ canSubmit })
    
    return Object.keys(errors).length === 0
  },

  saveProperty() {
    if (!this.validateForm()) {
      this.showValidationError()
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })

    const newProperty = {
      id: Date.now(),
      address: this.data.address.trim(),
      monthlyRent: parseFloat(this.data.monthlyRent),
      tenantName: this.data.tenantName || '',
      tenantPhone: this.data.tenantPhone || '',
      leaseStart: this.data.leaseStart || '',
      leaseEnd: this.data.leaseEnd || '',
      remark: this.data.remark || '',
      totalReceivedRent: 0,
      paymentHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    wx.getStorage({
      key: 'properties',
      success: (res) => {
        const properties = res.data || []
        properties.push(newProperty)
        wx.setStorage({
          key: 'properties',
          data: properties,
          success: () => {
            wx.hideLoading()
            wx.showToast({
              title: '添加成功',
              icon: 'success',
              duration: 1500,
              success: () => {
                setTimeout(() => {
                  wx.navigateBack()
                }, 1500)
              }
            })
          }
        })
      },
      fail: () => {
        wx.setStorage({
          key: 'properties',
          data: [newProperty],
          success: () => {
            wx.hideLoading()
            wx.showToast({
              title: '添加成功',
              icon: 'success',
              duration: 1500,
              success: () => {
                setTimeout(() => {
                  wx.navigateBack()
                }, 1500)
              }
            })
          }
        })
      }
    })
  },

  showValidationError() {
    const { errors } = this.data
    if (errors.address) {
      wx.showToast({ title: errors.address, icon: 'none' })
    } else if (errors.monthlyRent) {
      wx.showToast({ title: errors.monthlyRent, icon: 'none' })
    } else if (errors.tenantPhone) {
      wx.showToast({ title: errors.tenantPhone, icon: 'none' })
    } else if (errors.leaseDates) {
      wx.showToast({ title: errors.leaseDates, icon: 'none' })
    }
  },

  goBack() {
    wx.navigateBack()
  }
})```

### 📄 `pages/all-properties/all-properties.js`

```javascript
const leaseManager = require('../../utils/lease-manager.js')

Page({
  data: {
    rentingList: [],    // 出租中
    upcomingList: [],   // 即将出租
    unrentedList: []    // 未租
  },

  onLoad() {
    this.loadProperties()
  },

  onShow() {
    this.loadProperties()
  },

  loadProperties() {
    wx.getStorage({
      key: 'properties',
      success: (res) => {
        const properties = res.data || []
        
        // 分类
        const rentingList = []
        const upcomingList = []
        const unrentedList = []
        
        properties.forEach(property => {
          const status = leaseManager.getPropertyStatus(property)
          
          if (status === leaseManager.STATUS.RENTING) {
            rentingList.push(property)
          } else if (status === leaseManager.STATUS.UPCOMING) {
            upcomingList.push(property)
          } else {
            unrentedList.push(property)
          }
        })
        
        this.setData({ rentingList, upcomingList, unrentedList })
      }
    })
  },

  goToPropertyDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/property-detail/property-detail?id=${id}`
    })
  }
})```

### 📄 `pages/all-properties/property.js`

```javascript
Page({
  data: {
    propertyId: null,
    property: {},
    currentMonth: '',
    paymentHistory: []
  },

  onLoad(options) {
    const id = parseInt(options.id)
    this.setData({ propertyId: id })
    this.setCurrentMonth()
    this.loadPropertyData()
    this.loadPaymentHistory()
  },

  setCurrentMonth() {
    const date = new Date()
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    this.setData({
      currentMonth: `${year}年${month}月`
    })
  },

  loadPropertyData() {
    wx.getStorage({
      key: 'properties',
      success: (res) => {
        const properties = res.data || []
        const property = properties.find(p => p.id === this.data.propertyId)
        if (property) {
          this.setData({ property })
        }
      }
    })
  },

  loadPaymentHistory() {
    // 从本地存储加载历史记录
    wx.getStorage({
      key: `history_${this.data.propertyId}`,
      success: (res) => {
        this.setData({ paymentHistory: res.data || [] })
      },
      fail: () => {
        // 示例历史数据
        this.setData({
          paymentHistory: [
            { month: '2024年1月', isPaid: true, photo: '' },
            { month: '2023年12月', isPaid: true, photo: '' },
            { month: '2023年11月', isPaid: true, photo: '' }
          ]
        })
      }
    })
  },

  // 收租主流程：拍照 + 确认
  collectRent() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera', 'album'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        
        // 显示确认对话框
        wx.showModal({
          title: '确认收款',
          content: `确认收到 ${this.data.property.monthlyRent} 元租金吗？`,
          success: (modalRes) => {
            if (modalRes.confirm) {
              this.savePayment(tempFilePath)
            }
          }
        })
      }
    })
  },

  // 保存收款记录
  savePayment(photoPath) {
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`
    
    // 更新当前房产状态
    wx.getStorage({
      key: 'properties',
      success: (res) => {
        const properties = res.data || []
        const index = properties.findIndex(p => p.id === this.data.propertyId)
        
        if (index !== -1) {
          properties[index].isPaid = true
          properties[index].paymentPhoto = photoPath
          properties[index].paidDate = dateStr
          
          wx.setStorage({
            key: 'properties',
            data: properties,
            success: () => {
              // 更新历史记录
              this.addToHistory(photoPath)
              
              wx.showToast({
                title: '收款成功',
                icon: 'success'
              })
              
              // 刷新页面
              this.setData({ property: properties[index] })
            }
          })
        }
      }
    })
  },

  // 添加到历史记录
  addToHistory(photoPath) {
    const date = new Date()
    const monthStr = `${date.getFullYear()}年${date.getMonth()+1}月`
    const historyKey = `history_${this.data.propertyId}`
    
    wx.getStorage({
      key: historyKey,
      success: (res) => {
        const history = res.data || []
        // 检查本月是否已有记录
        const existingIndex = history.findIndex(h => h.month === monthStr)
        
        if (existingIndex !== -1) {
          history[existingIndex].isPaid = true
          history[existingIndex].photo = photoPath
        } else {
          history.unshift({
            month: monthStr,
            isPaid: true,
            photo: photoPath
          })
        }
        
        wx.setStorage({
          key: historyKey,
          data: history.slice(0, 12) // 只保留最近12个月
        })
        
        this.setData({ paymentHistory: history })
      }
    })
  },

  // 预览图片
  previewImage(e) {
    const src = e.currentTarget.dataset.src || this.data.property.paymentPhoto
    wx.previewImage({
      urls: [src]
    })
  },

  previewHistoryImage(e) {
    const src = e.currentTarget.dataset.src
    wx.previewImage({
      urls: [src]
    })
  }
})```

### 📄 `pages/index/index.js`

```javascript
const leaseManager = require('../../utils/lease-manager.js')

Page({
  data: {
    properties: [],        // 出租中的房产
    totalRent: 0,
    paidRent: 0,
    pendingRent: 0,
    pendingCount: 0,       // 待收租数量（红点）
    currentMonth: ''
  },

  onLoad() {
    this.setCurrentMonth()
    this.loadProperties()
  },

  onShow() {
    this.loadProperties()
  },

  setCurrentMonth() {
    const date = new Date()
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    this.setData({
      currentMonth: `${year}年${month}月`
    })
  },

  loadProperties() {
    wx.getStorage({
      key: 'properties',
      success: (res) => {
        const allProperties = res.data || []
        const currentYear = new Date().getFullYear()
        const currentMonth = new Date().getMonth() + 1
        
        // 筛选出租中的房产
        const rentingProperties = allProperties.filter(property => {
          const status = leaseManager.getPropertyStatus(property)
          return status === leaseManager.STATUS.RENTING
        })
        
        // 计算租金统计
        let totalRent = 0
        let paidRent = 0
        let pendingCount = 0
        
        rentingProperties.forEach(property => {
          const monthlyRent = property.monthlyRent || 0
          totalRent += monthlyRent
          
          // 检查当月是否已交租
          const payment = property.paymentHistory?.find(p => 
            p.year === currentYear && p.month === currentMonth
          )
          const isPaid = payment?.status === 'paid'
          
          if (isPaid) {
            paidRent += monthlyRent
          } else {
            pendingCount++
          }
          
          property.isPaid = isPaid
        })
        
        this.setData({
          properties: rentingProperties,
          totalRent,
          paidRent,
          pendingRent: totalRent - paidRent,
          pendingCount
        })
      },
      fail: () => {
        wx.setStorageSync('properties', [])
        this.setData({ properties: [] })
      }
    })
  },

  // 确认收款
  collectRent(e) {
    const property = e.currentTarget.dataset.property
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`
    
    wx.showModal({
      title: '确认收款',
      content: `确认收到 ${property.monthlyRent} 元租金吗？`,
      success: (res) => {
        if (res.confirm) {
          wx.getStorage({
            key: 'properties',
            success: (storageRes) => {
              const properties = storageRes.data || []
              const index = properties.findIndex(p => p.id === property.id)
              
              if (index !== -1) {
                // 初始化 paymentHistory
                if (!properties[index].paymentHistory) {
                  properties[index].paymentHistory = []
                }
                
                // 检查本月是否已有记录
                const existingIndex = properties[index].paymentHistory.findIndex(
                  p => p.year === currentYear && p.month === currentMonth
                )
                
                if (existingIndex !== -1) {
                  properties[index].paymentHistory[existingIndex].status = 'paid'
                  properties[index].paymentHistory[existingIndex].date = dateStr
                } else {
                  properties[index].paymentHistory.push({
                    year: currentYear,
                    month: currentMonth,
                    status: 'paid',
                    date: dateStr,
                    amount: property.monthlyRent
                  })
                }
                
                // 更新累计已收租金
                let total = 0
                properties[index].paymentHistory.forEach(p => {
                  if (p.status === 'paid') {
                    total += p.amount || property.monthlyRent
                  }
                })
                properties[index].totalReceivedRent = total
                properties[index].updatedAt = dateStr
                
                wx.setStorage({
                  key: 'properties',
                  data: properties,
                  success: () => {
                    wx.showToast({
                      title: '收款成功',
                      icon: 'success'
                    })
                    this.loadProperties()
                  }
                })
              }
            }
          })
        }
      }
    })
  },

  // 跳转到添加房产
  goToAddProperty() {
    wx.navigateTo({
      url: '/pages/add-property/add-property'
    })
  },

  // 跳转到房产详情
  goToPropertyDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/property-detail/property-detail?id=${id}`
    })
  }
})```

### 📄 `pages/property-detail/property-detail.js`

```javascript
const leaseManager = require('../../utils/lease-manager.js')

Page({
  data: {
    propertyId: null,
    property: null,
    status: '',
    statusText: '',
    isRenting: false,
    currentYear: 2024,
    monthsData: [],        // 12个月的点阵数据
    paidMonthsCount: 0,    // 已交租月数
    unpaidMonthsCount: 0,  // 未交租月数
    showEditModal: false,
    editForm: {
      address: '',
      monthlyRent: '',
      tenantName: '',
      tenantPhone: '',
      leaseStart: '',
      leaseEnd: '',
      remark: ''
    }
  },

  onLoad(options) {
    const id = parseInt(options.id)
    this.setData({ 
      propertyId: id,
      currentYear: new Date().getFullYear()
    })
    this.loadPropertyData()
  },

  loadPropertyData() {
    wx.getStorage({
      key: 'properties',
      success: (res) => {
        const properties = res.data || []
        const property = properties.find(p => p.id === this.data.propertyId)
        
        if (property) {
          const status = leaseManager.getPropertyStatus(property)
          const monthsData = leaseManager.getMonthlyPaymentStatus(property, this.data.currentYear)
          
          // 计算统计数据（在 JS 中处理，不在 WXML 中写箭头函数）
          const paidMonthsCount = monthsData.filter(m => m.isPaid).length
          const unpaidMonthsCount = monthsData.filter(m => !m.isPaid).length
          
          this.setData({
            property,
            status,
            statusText: leaseManager.STATUS_TEXT[status],
            isRenting: status === leaseManager.STATUS.RENTING,
            monthsData,
            paidMonthsCount,
            unpaidMonthsCount
          })
        }
      }
    })
  },

  // 切换年份
  prevYear() {
    const newYear = this.data.currentYear - 1
    this.setData({ currentYear: newYear })
    this.loadPropertyData()
  },

  nextYear() {
    const newYear = this.data.currentYear + 1
    this.setData({ currentYear: newYear })
    this.loadPropertyData()
  },

  // 确认收款
  collectRent() {
    const property = this.data.property
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`
    
    wx.showModal({
      title: '确认收款',
      content: `确认收到 ${property.monthlyRent} 元租金吗？`,
      success: (res) => {
        if (res.confirm) {
          wx.getStorage({
            key: 'properties',
            success: (storageRes) => {
              const properties = storageRes.data || []
              const index = properties.findIndex(p => p.id === property.id)
              
              if (index !== -1) {
                if (!properties[index].paymentHistory) {
                  properties[index].paymentHistory = []
                }
                
                const existingIndex = properties[index].paymentHistory.findIndex(
                  p => p.year === currentYear && p.month === currentMonth
                )
                
                if (existingIndex !== -1) {
                  properties[index].paymentHistory[existingIndex].status = 'paid'
                  properties[index].paymentHistory[existingIndex].date = dateStr
                } else {
                  properties[index].paymentHistory.push({
                    year: currentYear,
                    month: currentMonth,
                    status: 'paid',
                    date: dateStr,
                    amount: property.monthlyRent
                  })
                }
                
                // 更新累计租金
                let total = 0
                properties[index].paymentHistory.forEach(p => {
                  if (p.status === 'paid') {
                    total += p.amount || property.monthlyRent
                  }
                })
                properties[index].totalReceivedRent = total
                properties[index].updatedAt = dateStr
                
                wx.setStorage({
                  key: 'properties',
                  data: properties,
                  success: () => {
                    wx.showToast({ title: '收款成功', icon: 'success' })
                    this.loadPropertyData()
                    
                    // 刷新首页
                    const pages = getCurrentPages()
                    const homePage = pages.find(p => p.route === 'pages/index/index')
                    if (homePage && homePage.loadProperties) {
                      homePage.loadProperties()
                    }
                  }
                })
              }
            }
          })
        }
      }
    })
  },

  // 显示编辑弹窗
  showEditModal() {
    const property = this.data.property
    this.setData({
      showEditModal: true,
      editForm: {
        address: property.address,
        monthlyRent: String(property.monthlyRent),
        tenantName: property.tenantName || '',
        tenantPhone: property.tenantPhone || '',
        leaseStart: property.leaseStart || '',
        leaseEnd: property.leaseEnd || '',
        remark: property.remark || ''
      }
    })
  },

  hideEditModal() {
    this.setData({ showEditModal: false })
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({
      [`editForm.${field}`]: e.detail.value
    })
  },

  saveEdit() {
    const form = this.data.editForm
    
    if (!form.address.trim()) {
      wx.showToast({ title: '请输入地址', icon: 'none' })
      return
    }
    if (!form.monthlyRent || parseFloat(form.monthlyRent) <= 0) {
      wx.showToast({ title: '请输入有效租金', icon: 'none' })
      return
    }
    
    wx.getStorage({
      key: 'properties',
      success: (res) => {
        const properties = res.data || []
        const index = properties.findIndex(p => p.id === this.data.propertyId)
        
        if (index !== -1) {
          properties[index] = {
            ...properties[index],
            address: form.address.trim(),
            monthlyRent: parseFloat(form.monthlyRent),
            tenantName: form.tenantName,
            tenantPhone: form.tenantPhone,
            leaseStart: form.leaseStart,
            leaseEnd: form.leaseEnd,
            remark: form.remark,
            updatedAt: new Date().toISOString()
          }
          
          wx.setStorage({
            key: 'properties',
            data: properties,
            success: () => {
              wx.showToast({ title: '保存成功', icon: 'success' })
              this.hideEditModal()
              this.loadPropertyData()
              
              // 刷新首页和所有房产页
              const pages = getCurrentPages()
              const homePage = pages.find(p => p.route === 'pages/index/index')
              if (homePage && homePage.loadProperties) {
                homePage.loadProperties()
              }
              const allPage = pages.find(p => p.route === 'pages/all-properties/all-properties')
              if (allPage && allPage.loadProperties) {
                allPage.loadProperties()
              }
            }
          })
        }
      }
    })
  },

  // 删除房产
  deleteProperty() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这套房产吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.getStorage({
            key: 'properties',
            success: (storageRes) => {
              const properties = storageRes.data || []
              const newProperties = properties.filter(p => p.id !== this.data.propertyId)
              
              wx.setStorage({
                key: 'properties',
                data: newProperties,
                success: () => {
                  wx.showToast({ title: '删除成功', icon: 'success' })
                  setTimeout(() => {
                    wx.navigateBack()
                  }, 1500)
                }
              })
            }
          })
        }
      }
    })
  }
})```

### 📄 `pages/property-detail/record.js`

```javascript
Page({
  data: {
    // 当前选中的月份（格式：2024-02）
    selectedMonth: '',
    // 显示的月份文本（格式：2024年2月）
    displayMonth: '',
    // 月份汇总数据
    monthSummary: {
      total: 0,     // 当月应收
      paid: 0,      // 当月已收
      pending: 0    // 当月未收
    },
    // 当月交租明细
    monthDetails: [],
    // 所有房产数据
    properties: [],
    // 所有历史记录
    allRecords: [],
    // 筛选类型：all全部，paid已交，pending未交
    filterType: 'all',
    // 年份列表（用于快速跳转）
    years: []
  },

  onLoad() {
    // 初始化当前月份
    this.initCurrentMonth()
    // 加载数据
    this.loadAllData()
  },

  onShow() {
    // 每次显示页面都重新加载（可能有新记录）
    this.loadAllData()
  },

  // 初始化当前月份
  initCurrentMonth() {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const selectedMonth = `${year}-${month}`
    
    this.setData({
      selectedMonth,
      displayMonth: `${year}年${month}月`
    })
  },

  // 加载所有数据
  loadAllData() {
    // 加载房产数据
    wx.getStorage({
      key: 'properties',
      success: (res) => {
        const properties = res.data || []
        this.setData({ properties })
        this.generateYearList(properties)
        this.loadMonthData()
      },
      fail: () => {
        // 首次使用，生成示例数据
        this.generateSampleData()
      }
    })
  },

  // 生成年份列表
  generateYearList(properties) {
    const years = new Set()
    const currentYear = new Date().getFullYear()
    
    // 添加当前年份
    years.add(currentYear)
    
    // 从房产创建时间中提取年份
    properties.forEach(p => {
      if (p.createdAt) {
        const year = new Date(p.createdAt).getFullYear()
        years.add(year)
      }
    })
    
    // 转换为数组并排序（从近到远）
    const yearArray = Array.from(years).sort((a, b) => b - a)
    this.setData({ years: yearArray })
  },

  // 加载选中月份的数据
  loadMonthData() {
    const { selectedMonth, properties, filterType } = this.data
    const [year, month] = selectedMonth.split('-').map(Number)
    
    // 构建当月数据
    const monthDetails = []
    let totalRent = 0
    let paidRent = 0

    properties.forEach(property => {
      // 检查该房产当月是否已交租
      const isPaid = this.checkIfPaid(property, year, month)
      const monthlyRent = property.monthlyRent || 0
      
      totalRent += monthlyRent
      if (isPaid) {
        paidRent += monthlyRent
      }

      // 获取当月的支付记录（如果有）
      const paymentRecord = this.getPaymentRecord(property, year, month)

      monthDetails.push({
        id: property.id,
        address: property.address || '未知地址',
        tenant: property.tenant || '暂无租客',
        amount: monthlyRent,
        isPaid: isPaid,
        paymentDate: paymentRecord ? paymentRecord.date : '',
        paymentMethod: paymentRecord ? paymentRecord.method : '',
        paymentPhoto: paymentRecord ? paymentRecord.photo : '',
        remark: property.remark || ''
      })
    })

    // 根据筛选类型过滤
    let filteredDetails = monthDetails
    if (filterType === 'paid') {
      filteredDetails = monthDetails.filter(item => item.isPaid)
    } else if (filterType === 'pending') {
      filteredDetails = monthDetails.filter(item => !item.isPaid)
    }

    this.setData({
      monthDetails: filteredDetails,
      monthSummary: {
        total: totalRent,
        paid: paidRent,
        pending: totalRent - paidRent
      }
    })
  },

  // 检查房产在某月是否已交租
  checkIfPaid(property, year, month) {
    // 检查房产的当月支付状态
    if (property.paymentHistory) {
      return property.paymentHistory.some(p => 
        p.year === year && p.month === month && p.status === 'paid'
      )
    }
    
    // 如果没有历史记录，检查当前状态（仅适用于当月）
    const now = new Date()
    if (year === now.getFullYear() && month === now.getMonth() + 1) {
      return property.isPaid || false
    }
    
    return false
  },

  // 获取支付记录详情
  getPaymentRecord(property, year, month) {
    if (property.paymentHistory) {
      return property.paymentHistory.find(p => 
        p.year === year && p.month === month
      )
    }
    return null
  },

  // 月份变更处理
  onMonthChange(e) {
    const selectedMonth = e.detail.value
    const [year, month] = selectedMonth.split('-')
    const displayMonth = `${year}年${parseInt(month)}月`
    
    this.setData({
      selectedMonth,
      displayMonth
    }, () => {
      this.loadMonthData()
    })
  },

  // 快速切换到上个月
  goToPrevMonth() {
    const [year, month] = this.data.selectedMonth.split('-').map(Number)
    let newYear = year
    let newMonth = month - 1
    
    if (newMonth < 1) {
      newYear = year - 1
      newMonth = 12
    }
    
    const selectedMonth = `${newYear}-${String(newMonth).padStart(2, '0')}`
    const displayMonth = `${newYear}年${newMonth}月`
    
    this.setData({
      selectedMonth,
      displayMonth
    }, () => {
      this.loadMonthData()
    })
  },

  // 快速切换到下个月
  goToNextMonth() {
    const [year, month] = this.data.selectedMonth.split('-').map(Number)
    let newYear = year
    let newMonth = month + 1
    
    if (newMonth > 12) {
      newYear = year + 1
      newMonth = 1
    }
    
    const selectedMonth = `${newYear}-${String(newMonth).padStart(2, '0')}`
    const displayMonth = `${newYear}年${newMonth}月`
    
    this.setData({
      selectedMonth,
      displayMonth
    }, () => {
      this.loadMonthData()
    })
  },

  // 筛选变更
  onFilterChange(e) {
    const filterType = e.currentTarget.dataset.type
    this.setData({ filterType }, () => {
      this.loadMonthData()
    })
  },

  // 查看房产详情
  goToPropertyDetail(e) {
    const propertyId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/property/property?id=${propertyId}`
    })
  },

  // 预览收据照片
  previewReceipt(e) {
    const photo = e.currentTarget.dataset.photo
    if (photo) {
      wx.previewImage({
        urls: [photo]
      })
    }
  },

  // 查看大图
  previewImage(e) {
    const src = e.currentTarget.dataset.src
    wx.previewImage({
      urls: [src]
    })
  },

  // 导出当月数据（文本格式）
  exportData() {
    const { displayMonth, monthDetails, monthSummary } = this.data
    
    // 构建导出文本
    let exportText = `【房租记录】${displayMonth}\n`
    exportText += `══════════════════\n`
    exportText += `应收：${monthSummary.total}元\n`
    exportText += `已收：${monthSummary.paid}元\n`
    exportText += `未收：${monthSummary.pending}元\n`
    exportText += `══════════════════\n\n`
    
    monthDetails.forEach((item, index) => {
      exportText += `${index + 1}. ${item.address}\n`
      exportText += `   租客：${item.tenant}\n`
      exportText += `   金额：${item.amount}元\n`
      exportText += `   状态：${item.isPaid ? '✅ 已交' : '❌ 未交'}\n`
      if (item.paymentDate) {
        exportText += `   交租日：${item.paymentDate}\n`
      }
      exportText += '\n'
    })

    // 保存到剪贴板
    wx.setClipboardData({
      data: exportText,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        })
      }
    })
  },
})```

