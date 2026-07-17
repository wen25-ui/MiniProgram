const orderApi = require('../../../api/orderApi')

Page({
  data: {
    loading: true,
    order: null
  },
  onShow() {
    this.load()
  },
  load() {
    this.setData({ loading: true })
    orderApi.getCurrentClientOrder().then(order => {
      this.setData({ order, loading: false })
    })
  },
  goScreen() {
    wx.navigateTo({ url: '/pages/client/screen/index' })
  },
  goOrders() {
    wx.navigateTo({ url: '/pages/client/orders/index' })
  },
  goRefund() {
    wx.navigateTo({ url: '/pages/client/refund/index' })
  },
  switchRole() {
    wx.navigateBack({ delta: 1 })
  }
})
