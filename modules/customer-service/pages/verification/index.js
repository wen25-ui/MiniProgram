const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getCustomerVerifications } = require('../../../../services/client-application-service')

Page({
  data: { pending: [], rejected: [], completed: [], verifications: [], category: 'pending', loading: true, message: '' },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.setData({ loading: true, message: '' })
    Promise.all([getCustomerVerifications(), getCustomerVerifications('rejected'), getCustomerVerifications('completed')]).then(([pending, rejected, completed]) => {
      const category = this.data.category
      const verifications = category === 'completed' ? completed : category === 'rejected' ? rejected : pending
      this.setData({ pending, rejected, completed, verifications, loading: false })
    })
      .catch(error => this.setData({ loading: false, message: error.message }))
  },
  chooseCategory(event) {
    const category = event.currentTarget.dataset.category
    this.setData({ category, verifications: category === 'completed' ? this.data.completed : category === 'rejected' ? this.data.rejected : this.data.pending })
  },
  openDetail(event) {
    if (this.data.category !== 'pending') return
    wx.navigateTo({ url: `/modules/customer-service/pages/verification-detail/index?id=${event.currentTarget.dataset.id}` })
  }
})
