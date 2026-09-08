Page({
  data: {
    address: '',
    monthlyRent: '',
    tenantName: '',
    tenantPhone: '',
    leaseStart: '',
    leaseEnd: '',
    remark: '',
    canSubmit: false,
    errors: {}
  },

  onAddressInput(e) {
    this.setData({ address: e.detail.value })
    this.validateForm()
  },

  onRentInput(e) {
    this.setData({ monthlyRent: e.detail.value })
    this.validateForm()
  },

  onTenantNameInput(e) {
    this.setData({ tenantName: e.detail.value })
  },

  onTenantPhoneInput(e) {
    this.setData({ tenantPhone: e.detail.value })
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  onLeaseStartChange(e) {
    this.setData({ leaseStart: e.detail.value })
    if (this.data.leaseEnd && this.data.leaseEnd < e.detail.value) {
      this.setData({ leaseEnd: '' })
    }
  },

  onLeaseEndChange(e) {
    this.setData({ leaseEnd: e.detail.value })
  },

  validateForm() {
    const { address, monthlyRent, tenantPhone, leaseStart, leaseEnd } = this.data
    const errors = {}
    
    if (!address || address.trim() === '') {
      errors.address = '请输入房产地址'
    }
    
    if (!monthlyRent) {
      errors.monthlyRent = '请输入月租金'
    } else if (isNaN(monthlyRent) || parseFloat(monthlyRent) <= 0) {
      errors.monthlyRent = '请输入有效的租金金额'
    }
    
    if (tenantPhone) {
      const phoneRegex = /^1[3-9]\d{9}$/
      if (!phoneRegex.test(tenantPhone)) {
        errors.tenantPhone = '请输入有效的手机号码'
      }
    }
    
    if (leaseStart && leaseEnd && leaseEnd < leaseStart) {
      errors.leaseDates = '结束日期不能早于开始日期'
    }
    
    this.setData({ errors })
    
    const canSubmit = address && address.trim() !== '' && 
                      monthlyRent && parseFloat(monthlyRent) > 0
    this.setData({ canSubmit })
    
    return Object.keys(errors).length === 0
  },

  saveProperty() {
    if (!this.validateForm()) {
      this.showValidationError()
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })

    const newProperty = {
      id: Date.now(),
      address: this.data.address.trim(),
      monthlyRent: parseFloat(this.data.monthlyRent),
      tenantName: this.data.tenantName || '',
      tenantPhone: this.data.tenantPhone || '',
      leaseStart: this.data.leaseStart || '',
      leaseEnd: this.data.leaseEnd || '',
      remark: this.data.remark || '',
      totalReceivedRent: 0,
      paymentHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    wx.getStorage({
      key: 'properties',
      success: (res) => {
        const properties = res.data || []
        properties.push(newProperty)
        wx.setStorage({
          key: 'properties',
          data: properties,
          success: () => {
            wx.hideLoading()
            wx.showToast({
              title: '添加成功',
              icon: 'success',
              duration: 1500,
              success: () => {
                setTimeout(() => {
                  wx.navigateBack()
                }, 1500)
              }
            })
          }
        })
      },
      fail: () => {
        wx.setStorage({
          key: 'properties',
          data: [newProperty],
          success: () => {
            wx.hideLoading()
            wx.showToast({
              title: '添加成功',
              icon: 'success',
              duration: 1500,
              success: () => {
                setTimeout(() => {
                  wx.navigateBack()
                }, 1500)
              }
            })
          }
        })
      }
    })
  },

  showValidationError() {
    const { errors } = this.data
    if (errors.address) {
      wx.showToast({ title: errors.address, icon: 'none' })
    } else if (errors.monthlyRent) {
      wx.showToast({ title: errors.monthlyRent, icon: 'none' })
    } else if (errors.tenantPhone) {
      wx.showToast({ title: errors.tenantPhone, icon: 'none' })
    } else if (errors.leaseDates) {
      wx.showToast({ title: errors.leaseDates, icon: 'none' })
    }
  },

  goBack() {
    wx.navigateBack()
  }
})