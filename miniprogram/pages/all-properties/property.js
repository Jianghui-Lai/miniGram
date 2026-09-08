Page({
  data: {
    propertyId: null,
    property: {},
    currentMonth: '',
    paymentHistory: []
  },

  onLoad(options) {
    const id = parseInt(options.id)
    this.setData({ propertyId: id })
    this.setCurrentMonth()
    this.loadPropertyData()
    this.loadPaymentHistory()
  },

  setCurrentMonth() {
    const date = new Date()
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    this.setData({
      currentMonth: `${year}年${month}月`
    })
  },

  loadPropertyData() {
    wx.getStorage({
      key: 'properties',
      success: (res) => {
        const properties = res.data || []
        const property = properties.find(p => p.id === this.data.propertyId)
        if (property) {
          this.setData({ property })
        }
      }
    })
  },

  loadPaymentHistory() {
    // 从本地存储加载历史记录
    wx.getStorage({
      key: `history_${this.data.propertyId}`,
      success: (res) => {
        this.setData({ paymentHistory: res.data || [] })
      },
      fail: () => {
        // 示例历史数据
        this.setData({
          paymentHistory: [
            { month: '2024年1月', isPaid: true, photo: '' },
            { month: '2023年12月', isPaid: true, photo: '' },
            { month: '2023年11月', isPaid: true, photo: '' }
          ]
        })
      }
    })
  },

  // 收租主流程：拍照 + 确认
  collectRent() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera', 'album'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        
        // 显示确认对话框
        wx.showModal({
          title: '确认收款',
          content: `确认收到 ${this.data.property.monthlyRent} 元租金吗？`,
          success: (modalRes) => {
            if (modalRes.confirm) {
              this.savePayment(tempFilePath)
            }
          }
        })
      }
    })
  },

  // 保存收款记录
  savePayment(photoPath) {
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`
    
    // 更新当前房产状态
    wx.getStorage({
      key: 'properties',
      success: (res) => {
        const properties = res.data || []
        const index = properties.findIndex(p => p.id === this.data.propertyId)
        
        if (index !== -1) {
          properties[index].isPaid = true
          properties[index].paymentPhoto = photoPath
          properties[index].paidDate = dateStr
          
          wx.setStorage({
            key: 'properties',
            data: properties,
            success: () => {
              // 更新历史记录
              this.addToHistory(photoPath)
              
              wx.showToast({
                title: '收款成功',
                icon: 'success'
              })
              
              // 刷新页面
              this.setData({ property: properties[index] })
            }
          })
        }
      }
    })
  },

  // 添加到历史记录
  addToHistory(photoPath) {
    const date = new Date()
    const monthStr = `${date.getFullYear()}年${date.getMonth()+1}月`
    const historyKey = `history_${this.data.propertyId}`
    
    wx.getStorage({
      key: historyKey,
      success: (res) => {
        const history = res.data || []
        // 检查本月是否已有记录
        const existingIndex = history.findIndex(h => h.month === monthStr)
        
        if (existingIndex !== -1) {
          history[existingIndex].isPaid = true
          history[existingIndex].photo = photoPath
        } else {
          history.unshift({
            month: monthStr,
            isPaid: true,
            photo: photoPath
          })
        }
        
        wx.setStorage({
          key: historyKey,
          data: history.slice(0, 12) // 只保留最近12个月
        })
        
        this.setData({ paymentHistory: history })
      }
    })
  },

  // 预览图片
  previewImage(e) {
    const src = e.currentTarget.dataset.src || this.data.property.paymentPhoto
    wx.previewImage({
      urls: [src]
    })
  },

  previewHistoryImage(e) {
    const src = e.currentTarget.dataset.src
    wx.previewImage({
      urls: [src]
    })
  }
})