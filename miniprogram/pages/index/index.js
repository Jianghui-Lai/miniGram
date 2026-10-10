const dateUtils = require('../../utils/date-utils.js')
const propertyRepo = require('../../utils/property-repo.js')
const propertyQuery = require('../../utils/property-query.js')
const reminder = require('../../utils/reminder.js')

Page({
  data: {
    properties: [],        // 出租中的房产
    totalRent: 0,
    paidRent: 0,
    pendingRent: 0,
    overdueCount: 0,
    pendingCount: 0,       // 待收租数量（红点）
    currentMonth: '',
    reminder: {}           // 收租提醒汇总（横幅用）
  },

  onLoad() {
    const { year, month } = dateUtils.currentYearMonth()
    this.setData({ currentMonth: dateUtils.monthLabel(year, month) })
  },

  onShow() {
    this.loadProperties()
  },

  async loadProperties() {
    const list = await propertyRepo.getAll()
    const { year, month } = dateUtils.currentYearMonth()
    const { properties, totalRent, paidRent, pendingRent, pendingCount, overdueCount } =
      propertyQuery.buildDashboard(list, year, month)

    this.setData({
      properties: reminder.attachReminder(properties, year, month),
      totalRent,
      paidRent,
      pendingRent,
      pendingCount,
      overdueCount,
      reminder: reminder.buildReminderSummary(properties, year, month)
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
