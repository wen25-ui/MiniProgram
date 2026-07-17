const orderApi = require('../../../api/orderApi')

Page({
  data: {
    id: '',
    order: null
  },
  onLoad(options) {
    this.setData({ id: options.id || '' })
  },
  onShow() {
    const id = this.data.id
    const task = id ? orderApi.getOrder(id) : orderApi.getCurrentClientOrder()
    task.then(order => this.setData({ order }))
  }
})
