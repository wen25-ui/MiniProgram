const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getTaskStatistics } = require('../../api')

Page({
  data: {
    stats: { waitContact: 0, processing: 0, waitDispatch: 0, timeout: 0, todayCompleted: 0 },
    loading: true, statisticsUnavailable: false, message: ''
  },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) {
      return wx.reLaunch({ url: '/pages/auth/login/index' })
    }
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, statisticsUnavailable: false, message: '' })
    getTaskStatistics().then(statistics => {
      this.setData({
        stats: {
          waitContact: Number(statistics.waitContact || statistics.assigned || 0),
          processing: Number(statistics.processing || 0),
          waitDispatch: Number(statistics.waitDispatch || 0),
          timeout: Number(statistics.timeout || 0),
          todayCompleted: Number(statistics.todayCompleted || 0)
        },
        loading: false
      })
    }).catch(() => this.setData({ loading: false, statisticsUnavailable: true }))
  },
  goTasks(event) {
    const status = event && event.currentTarget.dataset.status
    wx.navigateTo({ url: `/modules/customer-service/pages/review/index${status ? `?status=${status}` : ''}` })
  },
  goFollowUp() { wx.navigateTo({ url: '/modules/customer-service/pages/follow-up/index' }) }
})
