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
})