const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { request } = require('../../../../services/api-client')

Page({
  data: { merchant: {}, stats: {}, applications: [], loading: true, message: '', qrVisible: false, qrLoading: false, qrDataUrl: '', inviteCode: '' },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.MERCHANT)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.setData({ loading: true, message: '' })
    request('/v1/merchant/dashboard', { session }).then(data => this.setData({ merchant: data.merchant || {}, stats: data.stats || {}, applications: data.applications || [], loading: false }))
      .catch(error => this.setData({ loading: false, message: error.message }))
  },
  goApplications() { wx.navigateTo({ url: '/modules/merchant/pages/applications/index' }) },
  showQr() {
    this.setData({ qrVisible: true, qrLoading: true, qrDataUrl: '', inviteCode: '', message: '' })
    request('/v1/merchant/invite-qr', { session: getSession() }).then(data => this.setData({ qrLoading: false, qrDataUrl: data.qrDataUrl || '', inviteCode: data.inviteCode || '' }))
      .catch(error => this.setData({ qrVisible: false, qrLoading: false, message: error.message }))
  },
  closeQr() { this.setData({ qrVisible: false }) },
  preventClose() {}
})
