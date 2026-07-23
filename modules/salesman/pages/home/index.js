const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getSalesmanTasks } = require('../../../../services/client-application-service')

Page({
  data: { stats: { waiting: 0, servicing: 0, verification: 0 }, applications: [], loading: true, message: '', session: {} },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.SALESMAN)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    getSalesmanTasks().then(applications => this.setData({
      session,
      applications: applications.slice(0, 4),
      stats: {
        waiting: applications.filter(item => ['PENDING_ACCEPT', 'WAITING_CONTACT', 'CONTACT_FAILED'].includes(item.status)).length,
        servicing: applications.filter(item => ['WAITING_HOME_SERVICE', 'WAITING_CUSTOMER_ARRIVAL', 'WAITING_START_CONFIRMATION', 'PROCESSING', 'WAITING_RESULT_UPLOAD'].includes(item.status)).length,
        verification: applications.filter(item => item.status === 'PENDING_VERIFICATION').length
      },
      loading: false,
      message: ''
    })).catch(error => this.setData({ loading: false, message: error.message }))
  },
  goTasks() { wx.navigateTo({ url: '/modules/salesman/pages/tasks/index' }) }
})
