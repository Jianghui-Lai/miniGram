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
    pendingMonthsCount: 0,  // 未交租月数
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
          const currentDate = new Date()
          const currentMonth = currentDate.getMonth() + 1
          const year = this.data.currentYear  // ✅ 使用 this.data.currentYear
          
          // 使用 getAllDueMonths 获取完整月度列表
          const allMonths = leaseManager.getAllDueMonths(property)
          
          // 筛选当前年份的月份
          const yearMonths = allMonths.filter(item => item.year === year)
          
          // 为每个月份附加颜色
          const monthsWithColor = yearMonths.map(item => {
            const detail = leaseManager.getMonthStatusDetail(property, item.year, item.month)
            return {
              year: item.year,
              month: item.month,
              amount: item.amount,
              status: detail.status,
              date: item.date,
              dotColor: detail.color,
              statusText: detail.text
            }
          })
          
          const paidMonthsCount = monthsWithColor.filter(m => m.status === 'paid').length
          const overdueMonthsCount = monthsWithColor.filter(m => m.status === 'overdue').length
          const pendingMonthsCount = monthsWithColor.filter(m => m.status === 'unpaid').length
          
          // 本月状态（用于按钮显示）✅ 使用 year 变量
          const currentDetail = leaseManager.getMonthStatusDetail(property, year, currentMonth)
          property._status = currentDetail.status
          
          this.setData({
            property,
            status,
            statusText: leaseManager.STATUS_TEXT[status],
            isRenting: status === leaseManager.STATUS.RENTING,
            monthsData: monthsWithColor,
            paidMonthsCount,
            overdueMonthsCount,
            pendingMonthsCount,
            currentYear: year,
            currentMonth
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
  const today = new Date()
  const currentYear = today.getFullYear()      // ✅ 定义 currentYear
  const currentMonth = today.getMonth() + 1    // ✅ 定义 currentMonth
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
  },

  // 撤销收租
  cancelRent() {
    const property = this.data.property
    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth() + 1
    
    wx.showModal({
      title: '⚠️ 撤销确认',
      content: `确定要撤销 ${currentYear}年${currentMonth}月的收租吗？`,
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.getStorage({
            key: 'properties',
            success: (storageRes) => {
              const properties = storageRes.data || []
              const index = properties.findIndex(p => p.id === property.id)
              
              if (index === -1) return
              
              // 找到当前月的记录
              const paymentIndex = properties[index].paymentHistory?.findIndex(
                p => p.year === currentYear && p.month === currentMonth
              )
              
              if (paymentIndex !== undefined && paymentIndex !== -1) {
                // 将状态改为 unpaid
                properties[index].paymentHistory[paymentIndex].status = 'unpaid'
                properties[index].paymentHistory[paymentIndex].date = null
                
                // 重新计算累计已收租金
                let total = 0
                properties[index].paymentHistory.forEach(p => {
                  if (p.status === 'paid') {
                    total += p.amount || property.monthlyRent
                  }
                })
                properties[index].totalReceivedRent = total
                properties[index].updatedAt = new Date().toISOString()
                
                wx.setStorage({
                  key: 'properties',
                  data: properties,
                  success: () => {
                    wx.showToast({ title: '已撤销', icon: 'none' })
                    this.loadPropertyData()
                    
                    // 刷新首页
                    const pages = getCurrentPages()
                    const homePage = pages.find(p => p.route === 'pages/index/index')
                    if (homePage && homePage.loadProperties) {
                      homePage.loadProperties()
                    }
                  }
                })
              } else {
                wx.showToast({ title: '未找到本月记录', icon: 'none' })
              }
            }
          })
        }
      }
    })
  },

  // 点击月份圆点
  onMonthTap(e) {
    const { month, status, amount } = e.currentTarget.dataset
    const property = this.data.property
    const year = this.data.currentYear
    
    // 未出租的月份（not_active）不响应
    if (status === 'not_active') {
      return
    }
    
    if (status === 'paid') {
      // 已收 → 撤销确认
      wx.showModal({
        title: '⚠️ 撤销确认',
        content: `确定撤销 ${year}年${month}月租金收款吗？`,
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) {
            this.cancelRentByMonth(year, month)
          }
        }
      })
    } else if (status === 'overdue' || status === 'unpaid') {
      // 欠租 / 待收 → 确认收款
      wx.showModal({
        title: '确认收款',
        content: `确认收到 ${year}年${month}月 ${amount} 元租金吗？`,
        success: (res) => {
          if (res.confirm) {
            this.collectRentByMonth(year, month, amount)
          }
        }
      })
    }
  },

  // 按月份确认收款
collectRentByMonth(year, month, amount) {
  const property = this.data.property
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`
  
  wx.getStorage({
    key: 'properties',
    success: (storageRes) => {
      const properties = storageRes.data || []
      const index = properties.findIndex(p => p.id === property.id)
      
      if (index === -1) return
      
      if (!properties[index].paymentHistory) {
        properties[index].paymentHistory = []
      }
      
      const existingIndex = properties[index].paymentHistory.findIndex(
        p => p.year === year && p.month === month
      )
      
      if (existingIndex !== -1) {
        properties[index].paymentHistory[existingIndex].status = 'paid'
        properties[index].paymentHistory[existingIndex].date = dateStr
        properties[index].paymentHistory[existingIndex].amount = amount
      } else {
        properties[index].paymentHistory.push({
          year: year,
          month: month,
          status: 'paid',
          date: dateStr,
          amount: amount
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
          wx.showToast({ title: `收款成功 ${amount}元`, icon: 'success' })
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
  })
},

// 按月份撤销收租
cancelRentByMonth(year, month) {
  const property = this.data.property
  
  wx.getStorage({
    key: 'properties',
    success: (storageRes) => {
      const properties = storageRes.data || []
      const index = properties.findIndex(p => p.id === property.id)
      
      if (index === -1) return
      
      const paymentIndex = properties[index].paymentHistory?.findIndex(
        p => p.year === year && p.month === month
      )
      
      if (paymentIndex !== undefined && paymentIndex !== -1) {
        properties[index].paymentHistory[paymentIndex].status = 'unpaid'
        properties[index].paymentHistory[paymentIndex].date = null
        
        // 重新计算累计已收租金
        let total = 0
        properties[index].paymentHistory.forEach(p => {
          if (p.status === 'paid') {
            total += p.amount || property.monthlyRent
          }
        })
        properties[index].totalReceivedRent = total
        properties[index].updatedAt = new Date().toISOString()
        
        wx.setStorage({
          key: 'properties',
          data: properties,
          success: () => {
            wx.showToast({ title: '已撤销', icon: 'none' })
            this.loadPropertyData()
            
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
},
  
})