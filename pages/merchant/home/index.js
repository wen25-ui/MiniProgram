const orderApi = require('../../../api/orderApi')
const { getDemoContext } = require('../../../api/context')
const { money } = require('../../../utils/format')

Page({
  data: {
    merchant: {},
    stats: {},
    latest: []
  },
  onShow() {
    const merchant = getDemoContext().merchant
    orderApi.listOrders({ merchantId: merchant.id }).then(orders => {
      const expected = orders.reduce((sum, order) => sum + Number(order.expectedCommission || 0), 0)
      const locked = orders.reduce((sum, order) => sum + Number(order.lockedCommission || 0), 0)
      const settled = orders.reduce((sum, order) => sum + Number(order.settledCommission || 0), 0)
      this.setData({
        merchant,
        latest: orders.slice(0, 2),
        stats: {
          count: orders.length,
          expected: money(expected),
          locked: money(locked),
          settled: money(settled)
        }
      })
    })
  },
  goCustomers() {
    wx.navigateTo({ url: '/pages/merchant/customers/index' })
  },
  goCommission() {
    wx.navigateTo({ url: '/pages/merchant/commission/index' })
  }
})
