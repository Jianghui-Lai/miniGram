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
    const sampleData = [
      {
        id: 1,
        address: '阳光小区 3-101',
        monthlyRent: 3000,
        tenantName: '张三',
        tenantPhone: '13800138001',
        leaseStart: '2024-01-01',
        leaseEnd: '2025-01-01',
        remark: '押一付三，每月1号交租',
        totalReceivedRent: 9000,
        paymentHistory: [
          { year: 2024, month: 1, status: 'paid', date: '2024-01-01', amount: 3000 },
          { year: 2024, month: 2, status: 'paid', date: '2024-02-01', amount: 3000 },
          { year: 2024, month: 3, status: 'paid', date: '2024-03-01', amount: 3000 }
        ],
        createdAt: '2024-01-01',
        updatedAt: '2024-03-01'
      },
      {
        id: 2,
        address: '阳光小区 3-102',
        monthlyRent: 2800,
        tenantName: '李四',
        tenantPhone: '13800138002',
        leaseStart: '2024-02-01',
        leaseEnd: '2025-02-01',
        remark: '',
        totalReceivedRent: 2800,
        paymentHistory: [
          { year: 2024, month: 2, status: 'paid', date: '2024-02-01', amount: 2800 }
        ],
        createdAt: '2024-02-01',
        updatedAt: '2024-02-01'
      },
      {
        id: 3,
        address: '阳光小区 3-103',
        monthlyRent: 3200,
        tenantName: '王五',
        tenantPhone: '13800138003',
        leaseStart: '2025-01-01',
        leaseEnd: '2026-01-01',
        remark: '明年开始出租',
        totalReceivedRent: 0,
        paymentHistory: [],
        createdAt: '2024-03-01',
        updatedAt: '2024-03-01'
      },
      {
        id: 4,
        address: '阳光小区 3-104',
        monthlyRent: 3500,
        tenantName: '',
        tenantPhone: '',
        leaseStart: '',
        leaseEnd: '',
        remark: '空置中',
        totalReceivedRent: 0,
        paymentHistory: [],
        createdAt: '2024-03-01',
        updatedAt: '2024-03-01'
      }
    ]
    
    wx.setStorageSync('properties', sampleData)
  }
})