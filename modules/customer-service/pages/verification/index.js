const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getCustomerVerifications } = require('../../../../services/client-application-service')

Page({
  data: { verifications: [], loading: true, message: '' },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.setData({ loading: true, message: '' })
    getCustomerVerifications().then(verifications => this.setData({ verifications, loading: false }))
      .catch(error => this.setData({ loading: false, message: error.message }))
  },
  openDetail(event) { wx.navigateTo({ url: `/modules/customer-service/pages/verification-detail/index?id=${event.currentTarget.dataset.id}` }) }
})
