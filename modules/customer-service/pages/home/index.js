const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getCustomerServiceApplications, getCustomerWorkItems, getCustomerVerifications } = require('../../../../services/client-application-service')

Page({
  data: { stats: { review: 0, appointment: 0, dispatch: 0, verify: 0 }, applications: [], loading: true, message: '' },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    Promise.all([getCustomerServiceApplications(), getCustomerWorkItems(), getCustomerVerifications()]).then(([reviews, workItems, verifications]) => {
      const verificationItems = verifications.map(item => Object.assign({}, item, { statusText: '待结果核销' }))
      const all = reviews.concat(workItems, verificationItems)
      this.setData({
        applications: all.slice(0, 4), loading: false, message: '',
        stats: {
          review: reviews.length,
          appointment: workItems.filter(item => ['PENDING_CONTACT', 'CONTACT_FAILED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT'].includes(item.status)).length,
          dispatch: workItems.filter(item => item.status === 'PENDING_DISPATCH').length,
          verify: verifications.length
        }
      })
    }).catch(error => this.setData({ loading: false, message: error.message }))
  },
  goReview() { wx.navigateTo({ url: '/modules/customer-service/pages/review/index' }) },
  goDispatch() { wx.navigateTo({ url: '/modules/customer-service/pages/dispatch/index' }) }
})
