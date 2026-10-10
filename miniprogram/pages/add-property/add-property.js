const propertyRepo = require('../../utils/property-repo.js')

Page({
  data: {
    address: '',
    monthlyRent: '',
    propertyFee: '',
    tenantName: '',
    tenantPhone: '',
    id: '',
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

  onPropertyFeeInput(e) {
    this.setData({ propertyFee: e.detail.value })
    this.validateForm()
  },

  onTenantNameInput(e) {
    this.setData({ tenantName: e.detail.value })
    this.validateForm()
  },

  onTenantPhoneInput(e) {
    this.setData({ tenantPhone: e.detail.value })
    this.validateForm()
  },

  onIdInput(e) {
    this.setData({ id: e.detail.value })
    this.validateForm()
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
    const { address, monthlyRent, propertyFee, tenantName, tenantPhone, id, leaseStart, leaseEnd } = this.data
    const errors = {}
  
    // 地址必填
    if (!address || address.trim() === '') {
      errors.address = '请输入房产地址'
    }
  
    // 月租金必填
    if (!monthlyRent) {
      errors.monthlyRent = '请输入月租金'
    } else if (isNaN(monthlyRent) || parseFloat(monthlyRent) <= 0) {
      errors.monthlyRent = '请输入有效的租金金额'
    }
  
  // 物业费选填：留空不校验，填了必须是 >= 0 的数字
  if (propertyFee !== undefined && propertyFee !== null && String(propertyFee).trim() !== '') {
    if (isNaN(propertyFee) || parseFloat(propertyFee) < 0) {
      errors.propertyFee = '请输入有效的物业费金额'
    }
  }

  // 租客姓名必填
  if (!tenantName || tenantName.trim() === '') {
      errors.tenantName = '请输入租客姓名'
    }
  
    // 租客电话必填
    if (!tenantPhone || tenantPhone.trim() === '') {
      errors.tenantPhone = '请输入联系电话'
    } else if (!/^1[3-9]\d{9}$/.test(tenantPhone)) {
      errors.tenantPhone = '请输入有效的手机号码'
    }
  
    // 身份证号必填
    if (!id || id.trim() === '') {
      errors.id = '请输入身份证号码'
    } else if (!/^\d{17}[\dXx]$/.test(id)) {
      errors.id = '请输入有效的身份证号码'
    }
  
    // 租期校验
    if (leaseStart && leaseEnd && leaseEnd < leaseStart) {
      errors.leaseDates = '结束日期不能早于开始日期'
    }
  
    this.setData({ errors })
  
    // 提交条件：地址 + 租金 + 姓名 + 电话 + 身份证
    // 用 !! 收敛成布尔值，否则 && 链会返回 '' / undefined，WXML 的 disabled 语义也对不上
    const canSubmit = !!(
      address && address.trim() !== '' &&
      monthlyRent && parseFloat(monthlyRent) > 0 &&
      tenantName && tenantName.trim() !== '' &&
      tenantPhone && /^1[3-9]\d{9}$/.test(tenantPhone) &&
      id && /^\d{17}[\dXx]$/.test(id)
    )
  
    this.setData({ canSubmit })
  
    return Object.keys(errors).length === 0
  },

  async saveProperty() {
    if (!this.validateForm()) {
      this.showValidationError()
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })

    const created = await propertyRepo.create({
      address: this.data.address,
      monthlyRent: this.data.monthlyRent,
      propertyFee: this.data.propertyFee,
      tenantName: this.data.tenantName,
      tenantPhone: this.data.tenantPhone,
      id: this.data.id || '',
      leaseStart: this.data.leaseStart,
      leaseEnd: this.data.leaseEnd,
      remark: this.data.remark
    })

    wx.hideLoading()

    if (!created) {
      return wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }

    wx.showToast({
      title: '添加成功',
      icon: 'success',
      duration: 1500
    })
    setTimeout(() => wx.navigateBack(), 1500)
  },

  showValidationError() {
    const { errors } = this.data
    if (errors.address) {
      wx.showToast({ title: errors.address, icon: 'none' })
    } else if (errors.monthlyRent) {
      wx.showToast({ title: errors.monthlyRent, icon: 'none' })
    } else if (errors.propertyFee) {
      wx.showToast({ title: errors.propertyFee, icon: 'none' })
    } else if (errors.tenantName) {
      wx.showToast({ title: errors.tenantName, icon: 'none' })
    } else if (errors.tenantPhone) {
      wx.showToast({ title: errors.tenantPhone, icon: 'none' })
    } else if (errors.id) {
      wx.showToast({ title: errors.id, icon: 'none' })
    } else if (errors.leaseDates) {
      wx.showToast({ title: errors.leaseDates, icon: 'none' })
    }
  },

  goBack() {
    wx.navigateBack()
  }
})