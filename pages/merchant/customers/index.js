const orderApi = require('../../../api/orderApi')
const { getDemoContext } = require('../../../api/context')

Page({
  data: {
    loading: true,
    orders: []
  },
  onShow() {
    const merchant = getDemoContext().merchant
    this.setData({ loading: true })
    orderApi.listOrders({ merchantId: merchant.id }).then(orders => {
      this.setData({ orders, loading: false })
    })
  },
  openDetail(event) {
    wx.navigateTo({ url: '/pages/merchant/order-detail/index?id=' + event.detail.id })
  }
})
