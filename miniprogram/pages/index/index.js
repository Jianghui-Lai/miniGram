const leaseManager = require('../../utils/lease-manager.js')

Page({
  data: {
    properties: [],        // 出租中的房产
    totalRent: 0,
    paidRent: 0,
    pendingRent: 0,
    overdueCount: 0,  
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
        const currentDate = new Date()
        const currentYear = currentDate.getFullYear()
        const currentMonth = currentDate.getMonth() + 1
  
        const rentingProperties = allProperties.filter(property => {
          return leaseManager.getPropertyStatus(property) === leaseManager.STATUS.RENTING
        })
  
        let totalRent = 0
        let paidRent = 0
        let pendingCount = 0
        let overdueCount = 0
  
        rentingProperties.forEach(property => {
          const monthlyRent = property.monthlyRent || 0
          totalRent += monthlyRent
  
          // ===== 使用新函数：实时计算本月状态 =====
          const detail = leaseManager.getMonthStatusDetail(property, currentYear, currentMonth)
  
          property._status = detail.status
          property._statusText = detail.text
          property._statusColor = detail.color
  
          if (detail.status === 'paid') {
            paidRent += monthlyRent
          } else if (detail.status === 'overdue') {
            overdueCount++
            pendingCount++
          } else if (detail.status === 'unpaid') {
            pendingCount++
          }
        })
  
        this.setData({
          properties: rentingProperties,
          totalRent,
          paidRent,
          pendingRent: totalRent - paidRent,
          pendingCount,
          overdueCount
        })
      },
      fail: () => {
        wx.setStorageSync('properties', [])
        this.setData({ properties: [] })
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
  },

})