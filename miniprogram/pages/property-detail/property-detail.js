const dateUtils = require('../../utils/date-utils.js')
const propertyRepo = require('../../utils/property-repo.js')
const propertyQuery = require('../../utils/property-query.js')
const reminder = require('../../utils/reminder.js')

Page({
  data: {
    propertyId: null,
    property: null,
    status: '',
    statusText: '',
    isRenting: false,
    currentYear: 2024,
    currentMonth: 1,
    reminderYear: 2024,      // 提醒只算「今天所在的月」，不随年历切换年份漂移
    reminderMonth: 1,
    reminder: {},            // 收租提醒状态（提醒条用）
    reminderDay: null,       // 每月提醒日（常驻展示）
    monthsData: [],
    paidMonthsCount: 0,
    overdueMonthsCount: 0,
    pendingMonthsCount: 0,
    showEditModal: false,
    editForm: {}
  },

  onLoad(options) {
    const { year, month } = dateUtils.currentYearMonth()
    this.setData({
      propertyId: parseInt(options.id),
      currentYear: year,
      currentMonth: month,
      reminderYear: year,
      reminderMonth: month
    })
    this.loadPropertyData()
  },

  // ========== 数据加载 ==========

  async loadPropertyData() {
    const property = await propertyRepo.findById(this.data.propertyId)
    if (!property) return

    const { property: viewProperty, ...rest } = propertyQuery.buildPropertyDetail(
      property,
      this.data.currentYear,
      this.data.currentMonth
    )

    const { reminderYear, reminderMonth } = this.data

    this.setData({
      property: viewProperty,
      ...rest,
      reminder: reminder.getReminderState(property, reminderYear, reminderMonth),
      reminderDay: reminder.getReminderDay(property)
    })
  },

  // 返回上一页时对方会走自己的 onShow，这里不需要再翻页面栈
  refreshAll() {
    this.loadPropertyData()
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
        const ok = await propertyRepo.cancelRent(this.data.propertyId, year, month)
        if (!ok) return wx.showToast({ title: '操作失败，请重试', icon: 'none' })
        wx.showToast({ title: '已撤销', icon: 'none' })
        this.refreshAll()
      }
    } else if (status === 'overdue' || status === 'unpaid') {
      const confirmed = await this.confirmDialog(
        '确认收款',
        `确认收到 ${year}年${month}月 ${amount} 元租金吗？`
      )
      if (confirmed) {
        const ok = await propertyRepo.collectRent(this.data.propertyId, year, month, amount)
        if (!ok) return wx.showToast({ title: '保存失败，请重试', icon: 'none' })
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
      const ok = await propertyRepo.collectRent(
        this.data.propertyId, currentYear, currentMonth, property.monthlyRent
      )
      if (!ok) return wx.showToast({ title: '保存失败，请重试', icon: 'none' })
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
      const ok = await propertyRepo.cancelRent(this.data.propertyId, currentYear, currentMonth)
      if (!ok) return wx.showToast({ title: '操作失败，请重试', icon: 'none' })
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

  // 阻止点击弹窗内容时冒泡到遮罩层而关闭弹窗
  preventClose() {},

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

    const ok = await propertyRepo.update(this.data.propertyId, form)
    if (!ok) return wx.showToast({ title: '保存失败，请重试', icon: 'none' })

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
      await propertyRepo.remove(this.data.propertyId)
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
  }
})
