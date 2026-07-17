const orderApi = require('../../../api/orderApi')
const { ORDER_STATUS } = require('../../../constants/status')

Page({
  data: {
    id: '',
    order: null,
    voucherImage: '',
    flags: {}
  },
  onLoad(options) {
    this.setData({ id: options.id || '' })
  },
  onShow() {
    this.load()
  },
  load() {
    orderApi.getOrder(this.data.id).then(order => {
      this.setData({
        order,
        voucherImage: order && order.voucherImage ? order.voucherImage : this.data.voucherImage,
        flags: {
          canAccept: order && order.status === ORDER_STATUS.WAIT_ACCEPT,
          canVisit: order && order.status === ORDER_STATUS.WAIT_VISIT && !order.visitMarked,
          canMarkProcessing: order && order.status === ORDER_STATUS.WAIT_VISIT && order.visitMarked,
          canSubmit: order && order.status === ORDER_STATUS.PROCESSING
        }
      })
    })
  },
  accept() {
    orderApi.acceptOrder(this.data.id).then(() => {
      wx.showToast({ title: '已接单', icon: 'success' })
      this.load()
    })
  },
  visit() {
    orderApi.markVisited(this.data.id).then(() => {
      wx.showToast({ title: '已标记上门', icon: 'success' })
      this.load()
    })
  },
  processing() {
    orderApi.markProcessing(this.data.id).then(() => {
      wx.showToast({ title: '办理中', icon: 'success' })
      this.load()
    })
  },
  chooseVoucher() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        this.setData({ voucherImage: res.tempFilePaths[0] })
      }
    })
  },
  previewVoucher() {
    if (!this.data.voucherImage) return
    wx.previewImage({
      current: this.data.voucherImage,
      urls: [this.data.voucherImage]
    })
  },
  submitVoucher() {
    if (!this.data.voucherImage) {
      wx.showToast({ title: '请先选择凭证图片', icon: 'none' })
      return
    }
    orderApi.submitVoucher(this.data.id, this.data.voucherImage).then(() => {
      wx.showToast({ title: '已提交核销', icon: 'success' })
      this.load()
    })
  }
})
