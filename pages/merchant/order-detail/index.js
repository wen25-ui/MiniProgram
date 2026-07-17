const orderApi = require('../../../api/orderApi')

Page({
  data: {
    id: '',
    order: null
  },
  onLoad(options) {
    this.setData({ id: options.id })
  },
  onShow() {
    orderApi.getOrder(this.data.id).then(order => this.setData({ order }))
  }
})
