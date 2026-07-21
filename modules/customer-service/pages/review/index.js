const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getCustomerServiceApplications } = require('../../../../services/client-application-service')

Page({
  data: { applications: [], message: '', loading: true },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '' })
    getCustomerServiceApplications()
      .then(applications => this.setData({ applications, loading: false }))
      .catch(error => this.setData({ loading: false, message: error.message }))
  },
  openDetail(event) {
    wx.navigateTo({ url: `/modules/customer-service/pages/review-detail/index?id=${event.currentTarget.dataset.id}` })
  }
})
