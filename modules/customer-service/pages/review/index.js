const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getReviews } = require('../../api')

const STATUS_TEXT = { WAIT_REVIEW: '待审核', WAIT_RECONTACT: '待重联' }

Page({
  data: {
    reviews: [], status: 'ALL', loading: true, message: '',
    filters: [{ key: 'ALL', label: '全部' }, { key: 'WAIT_REVIEW', label: '待审核' }, { key: 'WAIT_RECONTACT', label: '待重联' }]
  },
  onLoad(options) {
    if (['WAIT_REVIEW', 'WAIT_RECONTACT'].includes(options.status)) this.setData({ status: options.status })
  },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) {
      return wx.reLaunch({ url: '/pages/auth/login/index' })
    }
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '' })
    getReviews(this.data.status).then(rows => {
      const reviews = rows.map(item => Object.assign({}, item, {
        id: item.orderId || item.id,
        customerId: item.customerId || (item.customer && item.customer.id),
        customerName: item.customerName || (item.customer && item.customer.name) || '未填写',
        maskedPhone: item.maskedPhone || (item.customer && item.customer.maskedPhone) || '',
        projectName: item.projectName || (item.order && item.order.projectName) || '业务返现办理',
        statusText: STATUS_TEXT[item.status] || item.statusText || item.status
      }))
      this.setData({ reviews, loading: false })
    }).catch(error => this.setData({ loading: false, message: error.message }))
  },
  chooseFilter(event) {
    const status = event.currentTarget.dataset.status
    if (status === this.data.status) return
    this.setData({ status }, () => this.refresh())
  },
  openDetail(event) {
    const item = this.data.reviews[Number(event.currentTarget.dataset.index)]
    if (!item) return
    const customerId = item.customerId ? `&customerId=${item.customerId}` : ''
    const customerName = `&customerName=${encodeURIComponent(item.customerName || '')}`
    const projectName = `&projectName=${encodeURIComponent(item.projectName || '')}`
    wx.navigateTo({ url: `/modules/customer-service/pages/review-detail/index?id=${item.id}${customerId}${customerName}${projectName}` })
  }
})
