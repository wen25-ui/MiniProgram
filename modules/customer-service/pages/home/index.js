const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getCustomerServiceApplications, getCustomerWorkItems, getCustomerVerifications } = require('../../../../services/client-application-service')

Page({
  data: {
    stats: { review: 0, pendingDispatch: 0, dispatched: 0, pendingVerification: 0, completed: 0, total: 0 },
    applications: [], loading: true, message: ''
  },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    Promise.all([getCustomerServiceApplications(), getCustomerWorkItems(), getCustomerVerifications()]).then(([reviews, workItems, verifications]) => {
      const verificationItems = verifications.map(item => Object.assign({}, item, { statusText: item.statusText || '待核销' }))
      const all = reviews.concat(workItems, verificationItems)
      const applications = all.reduce((records, item) => {
        if (!records.some(record => record.id === item.id)) records.push(item)
        return records
      }, []).sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
      this.setData({
        applications: applications.slice(0, 4), loading: false, message: '',
        stats: {
          review: reviews.length,
          pendingDispatch: workItems.filter(item => item.status === 'PENDING_DISPATCH').length,
          dispatched: workItems.filter(item => ['PENDING_SERVICE', 'IN_SERVICE', 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE', 'VERIFICATION_RETURNED'].includes(item.status)).length,
          pendingVerification: verifications.length,
          completed: workItems.filter(item => item.status === 'SERVICE_COMPLETED').length,
          total: applications.length
        }
      })
    }).catch(error => this.setData({ loading: false, message: error.message }))
  },
  goReview() { wx.navigateTo({ url: '/modules/customer-service/pages/review/index' }) },
  goDispatch() { wx.navigateTo({ url: '/modules/customer-service/pages/dispatch/index' }) },
  goAllData(event) {
    const filter = event.currentTarget.dataset.filter || 'all'
    wx.navigateTo({ url: `/modules/customer-service/pages/all-data/index?filter=${filter}` })
  }
})
