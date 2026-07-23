const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getReviews, getFollowUps } = require('../../api')

Page({
  data: {
    stats: { waitReview: 0, waitRecontact: 0, following: 0, completed: 0 },
    recent: [], loading: true, message: ''
  },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) {
      return wx.reLaunch({ url: '/pages/auth/login/index' })
    }
    this.setData({ loading: true, message: '' })
    Promise.all([getReviews('ALL'), getFollowUps('ALL')]).then(([reviews, followUps]) => {
      const recent = reviews.concat(followUps).map(item => Object.assign({}, item, {
        id: item.orderId || item.id,
        statusText: item.statusText || ({ WAIT_REVIEW: '待审核', WAIT_RECONTACT: '待重联', BRANCH_ASSIGNED: '网点待处理', SALESMAN_PROCESSING: '业务处理中', FINISHED: '已完成' }[item.status] || item.status)
      })).sort((left, right) => String(right.updatedAt || right.submittedAt || '').localeCompare(String(left.updatedAt || left.submittedAt || ''))).slice(0, 4)
      this.setData({
        stats: {
          waitReview: reviews.filter(item => item.status === 'WAIT_REVIEW').length,
          waitRecontact: reviews.filter(item => item.status === 'WAIT_RECONTACT').length,
          following: followUps.filter(item => item.status !== 'FINISHED').length,
          completed: followUps.filter(item => item.status === 'FINISHED').length
        },
        recent,
        loading: false
      })
    }).catch(error => this.setData({ loading: false, message: error.message }))
  },
  goReview(event) {
    const status = event && event.currentTarget.dataset.status
    wx.navigateTo({ url: `/modules/customer-service/pages/review/index${status ? `?status=${status}` : ''}` })
  },
  goFollowUp(event) {
    const status = event && event.currentTarget.dataset.status
    wx.navigateTo({ url: `/modules/customer-service/pages/follow-up/index${status ? `?status=${status}` : ''}` })
  }
})
