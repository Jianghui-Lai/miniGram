const leaseManager = require('../../utils/lease-manager.js')

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

  loadProperties() {
    wx.getStorage({
      key: 'properties',
      success: (res) => {
        const properties = res.data || []
        
        // 分类
        const rentingList = []
        const upcomingList = []
        const unrentedList = []
        
        properties.forEach(property => {
          const status = leaseManager.getPropertyStatus(property)
          
          if (status === leaseManager.STATUS.RENTING) {
            rentingList.push(property)
          } else if (status === leaseManager.STATUS.UPCOMING) {
            upcomingList.push(property)
          } else {
            unrentedList.push(property)
          }
        })
        
        this.setData({ rentingList, upcomingList, unrentedList })
      }
    })
  },

  goToPropertyDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/property-detail/property-detail?id=${id}`
    })
  }
})