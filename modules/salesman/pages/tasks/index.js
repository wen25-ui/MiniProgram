const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getSalesmanTasks } = require('../../../../services/client-application-service')

const FILTERS = [
  { key: '', label: '全部' }, { key: 'pending', label: '待接收' },
  { key: 'contact', label: '待联系' }, { key: 'contact-failed', label: '联系失败' },
  { key: 'waiting', label: '待办理' }
]

Page({
  data: { tasks: [], filters: FILTERS, filter: '', message: '', loading: true, session: {} },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.SALESMAN)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.setData({ session })
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '' })
    getSalesmanTasks(this.data.filter).then(tasks => this.setData({ tasks, loading: false }))
      .catch(error => this.setData({ loading: false, message: error.message }))
  },
  chooseFilter(event) {
    this.setData({ filter: event.currentTarget.dataset.filter }, () => this.refresh())
  },
  openTask(event) { wx.navigateTo({ url: `/modules/salesman/pages/task-detail/index?id=${event.currentTarget.dataset.id}` }) }
})
