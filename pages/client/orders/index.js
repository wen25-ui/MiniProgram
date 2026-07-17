const orderApi = require('../../../api/orderApi')

Page({
  data: {
    loading: true,
    order: null
  },
  onShow() {
    this.setData({ loading: true })
    orderApi.getCurrentClientOrder().then(order => {
      this.setData({ order, loading: false })
    })
  },
  openDetail(event) {
    wx.navigateTo({ url: '/pages/client/order-detail/index?id=' + event.detail.id })
  }
})
