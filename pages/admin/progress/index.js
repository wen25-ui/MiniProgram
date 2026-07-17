const orderApi = require('../../../api/orderApi')

Page({
  data: {
    orders: []
  },
  onShow() {
    orderApi.listOrders().then(orders => {
      this.setData({
        orders: orders.map(order => {
          const latest = order.timeline && order.timeline.length ? order.timeline[order.timeline.length - 1] : null
          return Object.assign({}, order, {
            latestText: latest ? latest.text : '暂无进度',
            latestTime: latest ? latest.time : ''
          })
        })
      })
    })
  }
})
