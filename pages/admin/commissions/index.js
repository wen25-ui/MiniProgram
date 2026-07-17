const orderApi = require('../../../api/orderApi')

Page({
  data: {
    orders: []
  },
  onShow() {
    this.load()
  },
  load() {
    orderApi.listOrders().then(orders => {
      this.setData({
        orders: orders
          .filter(order => Number(order.lockedCommission || 0) > 0 || Number(order.settledCommission || 0) > 0)
          .map(order => Object.assign({}, order, {
            canSettle: order.commissionStatus !== '已结算'
          }))
      })
    })
  },
  settle(event) {
    orderApi.settleCommission(event.currentTarget.dataset.id).then(() => {
      wx.showToast({ title: '佣金已结算', icon: 'success' })
      this.load()
    })
  }
})
