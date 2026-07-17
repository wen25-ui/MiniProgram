const orderApi = require('../../../api/orderApi')
const { ORDER_STATUS } = require('../../../constants/status')

Page({
  data: {
    orders: []
  },
  onShow() {
    this.load()
  },
  load() {
    orderApi.listOrders({ status: [ORDER_STATUS.WAIT_REFUND, ORDER_STATUS.REFUNDED] }).then(orders => {
      this.setData({
        orders: orders.map(order => Object.assign({}, order, {
          canRefund: order.status === ORDER_STATUS.WAIT_REFUND
        }))
      })
    })
  },
  markRefunded(event) {
    orderApi.markRefunded(event.currentTarget.dataset.id).then(() => {
      wx.showToast({ title: '已标记退费', icon: 'success' })
      this.load()
    })
  }
})
