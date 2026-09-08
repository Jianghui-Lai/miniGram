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
})