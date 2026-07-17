Page({
  data: {
    phone: '13912345678',
    localOptions: ['请选择', '满足', '不满足'],
    localIndex: 0,
    packageOptions: ['请选择', '低于 199 元', '199-298 元', '299-398 元', '399 元以上'],
    packageIndex: 0,
    acceptOptions: ['请选择', '接受', '不接受'],
    acceptIndex: 0
  },
  onPhone(event) {
    this.setData({ phone: event.detail.value })
  },
  onLocal(event) {
    this.setData({ localIndex: Number(event.detail.value) })
  },
  onPackage(event) {
    this.setData({ packageIndex: Number(event.detail.value) })
  },
  onAccept(event) {
    this.setData({ acceptIndex: Number(event.detail.value) })
  },
  submit() {
    const phoneOk = /^1\d{10}$/.test(this.data.phone)
    const localQualified = this.data.localIndex === 1
    const packageQualified = this.data.packageIndex >= 2
    const longTermAccepted = this.data.acceptIndex === 1
    const passed = phoneOk && localQualified && packageQualified && longTermAccepted
    const form = {
      phone: this.data.phone,
      localQualified,
      packageLevel: this.data.packageOptions[this.data.packageIndex],
      longTermAccepted,
      passed
    }
    wx.setStorageSync('client_screen_form_v1', form)
    wx.navigateTo({ url: '/pages/client/screen-result/index?passed=' + (passed ? '1' : '0') })
  }
})
