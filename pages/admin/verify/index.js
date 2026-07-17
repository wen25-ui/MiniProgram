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
    orderApi.listOrders({ status: ORDER_STATUS.WAIT_VERIFY }).then(orders => this.setData({ orders }))
  },
  preview(event) {
    const url = event.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({ current: url, urls: [url] })
  },
  confirm(event) {
    orderApi.verifyOrder(event.currentTarget.dataset.id, true).then(() => {
      wx.showToast({ title: '核销成功', icon: 'success' })
      this.load()
    })
  },
  back(event) {
    orderApi.verifyOrder(event.currentTarget.dataset.id, false, '凭证图片需补充').then(() => {
      wx.showToast({ title: '已退回修改', icon: 'success' })
      this.load()
    })
  }
})
