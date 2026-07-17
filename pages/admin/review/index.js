const orderApi = require('../../../api/orderApi')
const { ORDER_STATUS } = require('../../../constants/status')

Page({
  data: {
    loading: true,
    orders: []
  },
  onShow() {
    this.setData({ loading: true })
    orderApi.listOrders({ status: ORDER_STATUS.WAIT_REVIEW }).then(orders => {
      this.setData({ orders, loading: false })
    })
  },
  openDetail(event) {
    wx.navigateTo({ url: '/pages/admin/review-detail/index?id=' + event.detail.id })
  }
})
