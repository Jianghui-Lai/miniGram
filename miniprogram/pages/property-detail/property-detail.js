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
})