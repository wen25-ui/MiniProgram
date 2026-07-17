Page({
  data: {
    passed: false,
    form: {}
  },
  onLoad(options) {
    this.setData({
      passed: options.passed === '1',
      form: wx.getStorageSync('client_screen_form_v1') || {}
    })
  },
  goProfile() {
    wx.navigateTo({ url: '/pages/client/profile/index' })
  },
  retry() {
    wx.navigateBack()
  }
})
