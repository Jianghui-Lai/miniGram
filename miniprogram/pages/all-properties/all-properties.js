const propertyRepo = require('../../utils/property-repo.js')
const propertyQuery = require('../../utils/property-query.js')

Page({
  data: {
    rentingList: [],    // 出租中
    upcomingList: [],   // 即将出租
    unrentedList: []    // 未租
  },

  onLoad() {
    this.loadProperties()
  },

  onShow() {
    this.loadProperties()
  },

  async loadProperties() {
    const list = await propertyRepo.getAll()
    this.setData(propertyQuery.groupByStatus(list))
  },

  goToPropertyDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/property-detail/property-detail?id=${id}`
    })
  }
})
