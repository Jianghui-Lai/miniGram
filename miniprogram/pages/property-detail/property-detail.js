const leaseManager = require('../../utils/lease-manager.js')
const propertyService = require('../../utils/property-store.js')

Page({
  data: {
    propertyId: null,
    property: null,
    status: '',
    statusText: '',
    isRenting: false,
    currentYear: 2024,
    currentMonth: 1,
    monthsData: [],
    paidMonthsCount: 0,
    overdueMonthsCount: 0,
    pendingMonthsCount: 0,
    showEditModal: false,
    editForm: { /* ... */ }
  },

  onLoad(options) {
    this.setData({
      propertyId: parseInt(options.id),
      currentYear: new Date().getFullYear(),
      currentMonth: new Date().getMonth() + 1
    })
    this.loadPropertyData()
  },

  // ========== 数据加载 ==========
  
  async loadPropertyData() {
    const properties = await propertyService.getAllProperties()
    const property = properties.find(p => p.id === this.data.propertyId)
    if (!property) return
    
    const status = leaseManager.getPropertyStatus(property)
    const year = this.data.currentYear
    const currentMonth = this.data.currentMonth
    
    // 获取该年所有月份状态
    const allMonths = leaseManager.getAllDueMonths(property)
    const yearMonths = allMonths.filter(item => item.year === year)
    
    const monthsData = yearMonths.map(item => {
      const detail = leaseManager.getMonthStatusDetail(property, item.year, item.month)
      return {
        year: item.year,
        month: item.month,
        amount: item.amount,
        status: detail.status,
        dotColor: detail.color,
        statusText: detail.text
      }
    })
    
    // 本月状态
    const currentDetail = leaseManager.getMonthStatusDetail(property, year, currentMonth)
    property._status = currentDetail.status
    
    this.setData({
      property,
      status,
      statusText: leaseManager.STATUS_TEXT[status],
      isRenting: status === leaseManager.STATUS.RENTING,
      monthsData,
      paidMonthsCount: monthsData.filter(m => m.status === 'paid').length,
      overdueMonthsCount: monthsData.filter(m => m.status === 'overdue').length,
      pendingMonthsCount: monthsData.filter(m => m.status === 'unpaid').length
    })
  },

  // ========== 年份切换 ==========
  
  prevYear() {
    this.setData({ currentYear: this.data.currentYear - 1 }, () => {
      this.loadPropertyData()
    })
  },

  nextYear() {
    this.setData({ currentYear: this.data.currentYear + 1 }, () => {
      this.loadPropertyData()
    })
  },

  // ========== 收租 / 撤销 ==========
  
  // 统一入口：点击日历圆点
  async onMonthTap(e) {
    const { month, status, amount } = e.currentTarget.dataset
    const year = this.data.currentYear
    
    if (status === 'paid') {
      const confirmed = await this.confirmDialog(
        '⚠️ 撤销确认',
        `确定撤销 ${year}年${month}月租金收款吗？`,
        '#ff4d4f'
      )
      if (confirmed) {
        await propertyService.cancelRent(this.data.propertyId, year, month)
        wx.showToast({ title: '已撤销', icon: 'none' })
        this.refreshAll()
      }
    } else if (status === 'overdue' || status === 'unpaid') {
      const confirmed = await this.confirmDialog(
        '确认收款',
        `确认收到 ${year}年${month}月 ${amount} 元租金吗？`
      )
      if (confirmed) {
        await propertyService.collectRent(this.data.propertyId, year, month, amount)
        wx.showToast({ title: `收款成功 ${amount}元`, icon: 'success' })
        this.refreshAll()
      }
    }
  },
  
  // 底部按钮：确认收到本月租金
  async collectRent() {
    const { property, currentYear, currentMonth } = this.data
    if (!property) return
    
    const confirmed = await this.confirmDialog(
      '确认收款',
      `确认收到 ${property.monthlyRent} 元租金吗？`
    )
    if (confirmed) {
      await propertyService.collectRent(
        this.data.propertyId, currentYear, currentMonth, property.monthlyRent
      )
      wx.showToast({ title: '收款成功', icon: 'success' })
      this.refreshAll()
    }
  },
  
  // 底部按钮：撤销
  async cancelRent() {
    const { currentYear, currentMonth } = this.data
    
    const confirmed = await this.confirmDialog(
      '⚠️ 撤销确认',
      `确定要撤销 ${currentYear}年${currentMonth}月的收租吗？`,
      '#ff4d4f'
    )
    if (confirmed) {
      await propertyService.cancelRent(this.data.propertyId, currentYear, currentMonth)
      wx.showToast({ title: '已撤销', icon: 'none' })
      this.refreshAll()
    }
  },

  // ========== 编辑 ==========
  
  showEditModal() {
    const p = this.data.property
    this.setData({
      showEditModal: true,
      editForm: {
        address: p.address,
        monthlyRent: String(p.monthlyRent),
        tenantName: p.tenantName || '',
        tenantPhone: p.tenantPhone || '',
        leaseStart: p.leaseStart || '',
        leaseEnd: p.leaseEnd || '',
        remark: p.remark || ''
      }
    })
  },

  hideEditModal() {
    this.setData({ showEditModal: false })
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`editForm.${field}`]: e.detail.value })
  },

  async saveEdit() {
    const form = this.data.editForm
    if (!form.address.trim()) {
      return wx.showToast({ title: '请输入地址', icon: 'none' })
    }
    if (!form.monthlyRent || parseFloat(form.monthlyRent) <= 0) {
      return wx.showToast({ title: '请输入有效租金', icon: 'none' })
    }
    
    await propertyService.updateProperty(this.data.propertyId, form)
    wx.showToast({ title: '保存成功', icon: 'success' })
    this.hideEditModal()
    this.refreshAll()
  },

  // ========== 删除 ==========
  
  async deleteProperty() {
    const confirmed = await this.confirmDialog(
      '确认删除',
      '删除后无法恢复，确定要删除这套房产吗？',
      '#ff4d4f'
    )
    if (confirmed) {
      await propertyService.deleteProperty(this.data.propertyId)
      wx.showToast({ title: '删除成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  // ========== 工具方法 ==========
  
  // 弹窗封装
  confirmDialog(title, content, confirmColor) {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        content,
        confirmColor: confirmColor || '#07c160',
        success: (res) => resolve(res.confirm)
      })
    })
  },
  
  // 统一刷新
  refreshAll() {
    this.loadPropertyData()
    
    const pages = getCurrentPages()
    const homePage = pages.find(p => p.route === 'pages/index/index')
    if (homePage?.loadProperties) homePage.loadProperties()
    
    const allPage = pages.find(p => p.route === 'pages/all-properties/all-properties')
    if (allPage?.loadProperties) allPage.loadProperties()
  }
})