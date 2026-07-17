const orderApi = require('../../../api/orderApi')

Page({
  data: {
    order: null
  },
  onShow() {
    orderApi.getCurrentClientOrder().then(order => {
      this.setData({ order })
    })
  }
})
