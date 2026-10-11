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
    fee: {},                // 当月物业费状态（兼容旧用法）
    feeList: [],            // 当月三类费用状态（物业费 / 水费 / 电费）
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

    const detail = propertyQuery.buildPropertyDetail(
      property,
      this.data.currentYear,
      this.data.currentMonth
    )

    const { reminderYear, reminderMonth } = this.data

    this.setData({
      property: detail.property,
      status: detail.status,
      statusText: detail.statusText,
      isRenting: detail.isRenting,
      monthsData: detail.monthsData,
      paidMonthsCount: detail.paidMonthsCount,
      overdueMonthsCount: detail.overdueMonthsCount,
      pendingMonthsCount: detail.pendingMonthsCount,
      fee: detail.fee,
      feeList: detail.feeList,
      reminder: reminder.getReminderState(property, reminderYear, reminderMonth),
      reminderDay: reminder.getReminderDay(property)
    })
  },

  // 返回上一页时对方会走自己的 onShow，这里不需要再翻页面栈
  refreshAll() {
    this.loadPropertyData()
  },

  // ========== 费用：物业费 / 水费 / 电费（只管当月，不进年历/统计/提醒） ==========

  // 点击状态标签：已缴 → 撤销；水/电 未设置 → 录入当月金额；未缴 → 确认付款
  async toggleFee(e) {
    const key = e.currentTarget.dataset.key
    const item = (this.data.feeList || []).find(f => f.key === key)
    if (!item || !item.tappable) return

    const { propertyId, currentYear: year, currentMonth: month } = this.data

    // 已缴 → 撤销（三类费用同一套确认框）
    if (item.status === 'paid') {
      return this.runAction({
        confirm: {
          title: '⚠️ 撤销确认',
          content: `确定撤销 ${year}年${month}月${item.label}的缴纳记录吗？`,
          color: '#ff4d4f'
        },
        action: () => propertyRepo.cancelFee(propertyId, key, year, month),
        successText: '已撤销',
        successIcon: 'none'
      })
    }

    // 水 / 电 未设置 → 先录入当月金额（只存应收，不改状态）
    if (item.needInput && !(item.dueAmount > 0)) {
      const amount = await this.promptAmount(`录入 ${year}年${month}月${item.label}`, '')
      if (amount === null) return

      return this.runAction({
        action: () => propertyRepo.setMonthlyFee(propertyId, key, year, month, amount),
        successText: `已录入 ${amount}元`,
        failText: '保存失败，请重试'
      })
    }

    // 水 / 电 已录入 → 弹窗预填金额，确认即付款
    if (item.needInput) {
      const amount = await this.promptAmount(
        `${year}年${month}月${item.label}缴费`,
        String(item.dueAmount)
      )
      if (amount === null) return

      return this.runAction({
        action: () => propertyRepo.collectFee(propertyId, key, year, month, amount),
        successText: `已缴 ${amount}元`,
        failText: '保存失败，请重试'
      })
    }

    // 物业费：按房产上设置的月金额确认入账
    return this.runAction({
      confirm: {
        title: '确认缴费',
        content: `确认已交 ${year}年${month}月${item.label} ${item.dueAmount} 元吗？`
      },
      action: () => propertyRepo.collectFee(propertyId, key, year, month, item.dueAmount),
      successText: `已缴 ${item.dueAmount}元`,
      failText: '保存失败，请重试'
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
      return this.runAction({
        confirm: {
          title: '⚠️ 撤销确认',
          content: `确定撤销 ${year}年${month}月租金收款吗？`,
          color: '#ff4d4f'
        },
        action: () => propertyRepo.cancelRent(this.data.propertyId, year, month),
        successText: '已撤销',
        successIcon: 'none'
      })
    }

    if (status === 'overdue' || status === 'unpaid') {
      return this.runAction({
        confirm: {
          title: '确认收款',
          content: `确认收到 ${year}年${month}月 ${amount} 元租金吗？`
        },
        action: () => propertyRepo.collectRent(this.data.propertyId, year, month, amount),
        successText: `收款成功 ${amount}元`,
        failText: '保存失败，请重试'
      })
    }
  },

  // 底部按钮：确认收到本月租金
  async collectRent() {
    const { property, currentYear, currentMonth } = this.data
    if (!property) return

    return this.runAction({
      confirm: {
        title: '确认收款',
        content: `确认收到 ${property.monthlyRent} 元租金吗？`
      },
      action: () => propertyRepo.collectRent(
        this.data.propertyId, currentYear, currentMonth, property.monthlyRent
      ),
      successText: '收款成功',
      failText: '保存失败，请重试'
    })
  },

  // 底部按钮：撤销
  async cancelRent() {
    const { currentYear, currentMonth } = this.data

    return this.runAction({
      confirm: {
        title: '⚠️ 撤销确认',
        content: `确定要撤销 ${currentYear}年${currentMonth}月的收租吗？`,
        color: '#ff4d4f'
      },
      action: () => propertyRepo.cancelRent(this.data.propertyId, currentYear, currentMonth),
      successText: '已撤销',
      successIcon: 'none'
    })
  },

  // ========== 编辑 ==========

  showEditModal() {
    const p = this.data.property
    this.setData({
      showEditModal: true,
      editForm: {
        address: p.address,
        monthlyRent: String(p.monthlyRent),
        propertyFee: p.propertyFee === undefined || p.propertyFee === null ? '' : String(p.propertyFee),
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
    // 物业费选填：留空算未设置，填了不能为负
    if (form.propertyFee !== '' && parseFloat(form.propertyFee) < 0) {
      return wx.showToast({ title: '请输入有效物业费', icon: 'none' })
    }

    const ok = await propertyRepo.update(this.data.propertyId, form)
    if (!ok) return wx.showToast({ title: '保存失败，请重试', icon: 'none' })

    wx.showToast({ title: '保存成功', icon: 'success' })
    this.hideEditModal()
    this.refreshAll()
  },

  // ========== 删除 ==========

  async deleteProperty() {
    return this.runAction({
      confirm: {
        title: '确认删除',
        content: '删除后无法恢复，确定要删除这套房产吗？',
        color: '#ff4d4f'
      },
      action: () => propertyRepo.remove(this.data.propertyId),
      successText: '删除成功',
      after: () => setTimeout(() => wx.navigateBack(), 1500)
    })
  },

  // ========== 工具方法 ==========

  /**
   * 统一的「（可选）确认 → 写库 → toast → 刷新」
   * 页面上所有写操作都走这里，避免每处重复一遍确认 / 失败提示 / 刷新
   * @param {object} options
   * @param {{title:string, content:string, color:string}} [options.confirm] 不传则不弹确认框
   * @param {function():Promise<boolean>} options.action 写库动作，返回 false 视为失败
   * @param {string} options.successText
   * @param {'success'|'none'} [options.successIcon]
   * @param {string} [options.failText]
   * @param {function()} [options.after] 成功后的收尾（不传则刷新页面）
   */
  async runAction({ confirm, action, successText, successIcon = 'success', failText = '操作失败，请重试', after }) {
    if (confirm) {
      const confirmed = await this.confirmDialog(confirm.title, confirm.content, confirm.color)
      if (!confirmed) return
    }

    const ok = await action()
    if (!ok) return wx.showToast({ title: failText, icon: 'none' })

    wx.showToast({ title: successText, icon: successIcon })
    if (after) return after()
    this.refreshAll()
  },

  // wx.showModal 的 Promise 封装（confirmDialog / promptAmount 共用）
  showModal(options) {
    return new Promise((resolve) => {
      wx.showModal({
        ...options,
        success: resolve,
        fail: () => resolve({ confirm: false })
      })
    })
  },

  // 普通确认框
  confirmDialog(title, content, confirmColor) {
    return this.showModal({
      title,
      content,
      confirmColor: confirmColor || '#07c160'
    }).then(res => !!res.confirm)
  },

  // 带输入框的金额弹窗：取消 / 非法金额返回 null（不落库）
  promptAmount(title, preset) {
    return this.showModal({
      title,
      editable: true,
      placeholderText: '请输入金额（元）',
      content: preset || '',
      confirmText: '确认'
    }).then(res => {
      if (!res.confirm) return null

      const text = String(res.content === undefined ? '' : res.content).trim()
      const amount = parseFloat(text)
      if (!text || !Number.isFinite(amount) || amount <= 0) {
        wx.showToast({ title: '请输入有效金额', icon: 'none' })
        return null
      }
      return Math.round(amount * 100) / 100
    })
  }
})
