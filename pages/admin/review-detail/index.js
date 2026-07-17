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
    orderApi.getOrder(this.data.id).then(order => this.setData({ order }))
  },
  approve() {
    orderApi.reviewOrder(this.data.id, true).then(() => {
      wx.showToast({ title: '审核通过', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 350)
    })
  },
  reject() {
    orderApi.reviewOrder(this.data.id, false, '人工审核不通过').then(() => {
      wx.showToast({ title: '已驳回', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 350)
    })
  }
})
