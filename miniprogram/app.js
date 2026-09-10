// app.js
App({
  onLaunch() {
    // 初始化示例数据（如果没有数据）
    this.initSampleData()
  },

  initSampleData() {
    wx.getStorage({
      key: 'properties',
      success: (res) => {
        if (!res.data || res.data.length === 0) {
          this.loadSampleData()
        }
      },
      fail: () => {
        this.loadSampleData()
      }
    })
  },

  loadSampleData() {
    const sampleData = []
    
    wx.setStorageSync('properties', sampleData)
  }
})