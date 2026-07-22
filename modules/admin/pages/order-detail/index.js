const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getOrder } = require('../../../../services/admin-service')

Page({
  data: { id: '', order: null, loading: true, message: '' },
  onLoad(options) { this.setData({ id: options.id || '' }); this.load() },
  load() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.ADMIN)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    getOrder(this.data.id).then(order => this.setData({ order, loading: false })).catch(error => this.setData({ loading: false, message: error.message }))
  }
})
