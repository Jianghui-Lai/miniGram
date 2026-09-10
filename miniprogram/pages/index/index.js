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
    this.debugPrintStatus() 
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
  },

  // 调试方法：打印所有月份状态
// 调试方法：打印所有月份状态（使用新的实时计算）
debugPrintStatus() {
  wx.getStorage({
    key: 'properties',
    success: (res) => {
      const allProperties = res.data || []
      const currentDate = new Date()
      const currentYear = currentDate.getFullYear()
      const currentMonth = currentDate.getMonth() + 1
      
      console.log('===== 调试：租期内所有月份状态（实时计算） =====')
      allProperties.forEach(property => {
        console.log(`🏠 房产: ${property.address}`)
        console.log(`租期: ${property.leaseStart} 至 ${property.leaseEnd}`)
        
        // ===== 使用 getAllDueMonths 获取租期内所有月份 =====
        const allMonths = leaseManager.getAllDueMonths(property)
        
        if (allMonths.length === 0) {
          console.log('  ⚠️ 无有效租期或租期内无月份')
        } else {
          allMonths.forEach(item => {
            // 使用 getMonthStatusDetail 获取每个月的状态
            const detail = leaseManager.getMonthStatusDetail(property, item.year, item.month)
            const statusEmoji = detail.status === 'paid' ? '✅已收' : '❌未收'
            const overdueMark = detail.status === 'overdue' ? ' 🔴欠租' : ''
            console.log(`  ${item.year}年${item.month}月: ${statusEmoji}${overdueMark}`)
          })
        }
        
        // 打印本月状态
        const detail = leaseManager.getMonthStatusDetail(property, currentYear, currentMonth)
        console.log(`📌 本月(${currentYear}年${currentMonth}月)状态: ${detail.text} (${detail.status})`)
        console.log('---')
      })
      console.log('===============================')
    }
  })
},
})