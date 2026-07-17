const orderApi = require('../../../api/orderApi')
const { getDemoContext } = require('../../../api/context')
const { money } = require('../../../utils/format')

Page({
  data: {
    orders: [],
    summary: {}
  },
  onShow() {
    const merchant = getDemoContext().merchant
    orderApi.listOrders({ merchantId: merchant.id }).then(orders => {
      const expected = orders.reduce((sum, item) => sum + Number(item.expectedCommission || 0), 0)
      const locked = orders.reduce((sum, item) => sum + Number(item.lockedCommission || 0), 0)
      const settled = orders.reduce((sum, item) => sum + Number(item.settledCommission || 0), 0)
      this.setData({
        orders,
        summary: {
          expected: money(expected),
          locked: money(locked),
          settled: money(settled)
        }
      })
    })
  }
})
