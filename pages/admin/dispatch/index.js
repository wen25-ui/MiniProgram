const orderApi = require('../../../api/orderApi')
const { getDemoContext } = require('../../../api/context')
const { ORDER_STATUS } = require('../../../constants/status')

Page({
  data: {
    salesmen: [],
    selectedMap: {},
    orders: []
  },
  onShow() {
    this.setData({ salesmen: getDemoContext().salesmen })
    this.load()
  },
  load() {
    orderApi.listOrders({ status: ORDER_STATUS.WAIT_DISPATCH }).then(orders => {
      this.setData({
        orders: orders.map(order => Object.assign({}, order, {
          selectedSalesmanName: this.data.salesmen[0] ? this.data.salesmen[0].name : ''
        }))
      })
    })
  },
  onPick(event) {
    const id = event.currentTarget.dataset.id
    const index = Number(event.detail.value)
    const salesman = this.data.salesmen[index]
    const orders = this.data.orders.map(order => {
      if (order.id !== id) return order
      return Object.assign({}, order, { selectedSalesmanName: salesman.name })
    })
    this.setData({
      ['selectedMap.' + id]: index,
      orders
    })
  },
  dispatch(event) {
    const id = event.currentTarget.dataset.id
    const index = this.data.selectedMap[id] || 0
    const salesman = this.data.salesmen[index]
    orderApi.dispatchOrder(id, salesman.id).then(() => {
      wx.showToast({ title: '派单成功', icon: 'success' })
      this.load()
    })
  }
})
