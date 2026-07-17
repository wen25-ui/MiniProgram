const orderApi = require('../../../api/orderApi')
const { getDemoContext } = require('../../../api/context')

Page({
  data: {
    salesman: {},
    loading: true,
    orders: []
  },
  onShow() {
    const salesman = getDemoContext().salesman
    this.setData({ salesman, loading: true })
    orderApi.listOrders({ salesmanId: salesman.id }).then(orders => {
      this.setData({ orders, loading: false })
    })
  },
  openDetail(event) {
    wx.navigateTo({ url: '/pages/salesman/task-detail/index?id=' + event.detail.id })
  }
})
