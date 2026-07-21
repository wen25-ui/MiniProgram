const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getCustomerVerifications } = require('../../../../services/client-application-service')

Page({
  data: { pending: [], completed: [], verifications: [], category: 'pending', loading: true, message: '' },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.setData({ loading: true, message: '' })
    Promise.all([getCustomerVerifications(), getCustomerVerifications('completed')]).then(([pending, completed]) => {
      const category = this.data.category
      this.setData({ pending, completed, verifications: category === 'completed' ? completed : pending, loading: false })
    })
      .catch(error => this.setData({ loading: false, message: error.message }))
  },
  chooseCategory(event) {
    const category = event.currentTarget.dataset.category
    this.setData({ category, verifications: category === 'completed' ? this.data.completed : this.data.pending })
  },
  openDetail(event) {
    if (this.data.category === 'completed') return
    wx.navigateTo({ url: `/modules/customer-service/pages/verification-detail/index?id=${event.currentTarget.dataset.id}` })
  }
})
