const orderApi = require('../../../api/orderApi')

Page({
  data: {
    submitting: false,
    customerName: '赵先生',
    phone: '',
    address: '南山区科技园 8 栋',
    date: '2026-07-18',
    time: '10:00'
  },
  onLoad() {
    const form = wx.getStorageSync('client_screen_form_v1') || {}
    this.setData({ phone: form.phone || '' })
  },
  onInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value })
  },
  onDate(event) {
    this.setData({ date: event.detail.value })
  },
  onTime(event) {
    this.setData({ time: event.detail.value })
  },
  submit() {
    if (!this.data.customerName || !this.data.phone || !this.data.address) {
      wx.showToast({ title: '请补充完整资料', icon: 'none' })
      return
    }
    const screen = wx.getStorageSync('client_screen_form_v1') || {}
    this.setData({ submitting: true })
    orderApi.submitApplication({
      customerName: this.data.customerName,
      phone: this.data.phone,
      address: this.data.address,
      appointmentTime: this.data.date + ' ' + this.data.time,
      packageLevel: screen.packageLevel,
      localQualified: screen.localQualified,
      longTermAccepted: screen.longTermAccepted
    }).then(order => {
      this.setData({ submitting: false })
      wx.showToast({ title: '提交成功', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/client/order-detail/index?id=' + order.id })
      }, 350)
    })
  }
})
