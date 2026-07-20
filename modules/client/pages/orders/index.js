const { getSession } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { request } = require('../../../../services/api-client')

const STATUS_STAGE = {
  PRE_SCREEN_REJECTED: 0, PENDING_REVIEW: 1, REVIEW_REJECTED: 1,
  PENDING_CONTACT: 2, CONTACT_FAILED: 2, PENDING_SERVICE_MODE: 2, PENDING_APPOINTMENT: 2, PENDING_DISPATCH: 2,
  PENDING_SERVICE: 3, IN_SERVICE: 3, PENDING_STORE_SERVICE: 3, IN_STORE_SERVICE: 3, SERVICE_FAILED: 3, PENDING_VERIFICATION: 4,
  VERIFICATION_RETURNED: 4, SERVICE_COMPLETED: 5, CLOSED: 5
}

function decorate(application) {
  const stage = STATUS_STAGE[application.status] || 0
  return Object.assign({}, application, {
    stage,
    progress: Math.max(8, Math.round((stage / 5) * 100))
  })
}

Page({
  data: { applications: [], loading: true, message: '' },
  onShow() {
    const session = getSession()
    if (!session || session.defaultRole !== ROLES.CLIENT) {
      wx.reLaunch({ url: '/pages/auth/register/index' })
      return
    }
    this.setData({ loading: true, message: '' })
    request('/v1/applications/me', { session }).then(response => {
      this.setData({ applications: (response.applications || []).map(decorate), loading: false })
    }).catch(error => this.setData({ applications: [], loading: false, message: error.message }))
  },
  goScreening() { wx.navigateTo({ url: '/modules/client/pages/qualification/index' }) },
  goDetail(event) { wx.navigateTo({ url: `/modules/client/pages/application-detail/index?id=${event.currentTarget.dataset.id}` }) }
})
