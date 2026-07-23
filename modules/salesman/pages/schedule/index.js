const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getSchedule, getTasks } = require('../../api')
const { taskView } = require('../../task-view')

function executionTime(task) {
  const value = String(task.appointmentTime || task.scheduledAt || '').replace(/-/g, '/')
  const timestamp = value ? new Date(value).getTime() : NaN
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp
}

function scheduleView(item) {
  const task = taskView(item)
  const appointmentTime = task.appointmentTime || task.scheduledAt || ''
  const parts = String(appointmentTime).split(' ')
  return Object.assign({}, task, {
    appointmentTime,
    executionDate: parts[0] || '日期待确认',
    executionClock: parts[1] ? parts[1].slice(0, 5) : '时间待确认',
    address: task.address || task.serviceAddress || task.storeName || '办理地址暂未填写'
  })
}

Page({
  data: { schedules: [], loading: true, message: '', scheduleApiUnavailable: false },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.SALESMAN)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '', scheduleApiUnavailable: false })
    getSchedule().then(rows => this.showSchedules(rows, false)).catch(() => {
      // TODO: 后端提供 GET /salesman/schedule 后移除本人任务预约兼容回退。
      getTasks().then(rows => this.showSchedules(rows.filter(item => item.appointmentTime), true))
        .catch(error => this.setData({ loading: false, message: error.message }))
    })
  },
  showSchedules(rows, scheduleApiUnavailable) {
    const schedules = rows.map(scheduleView).sort((left, right) => executionTime(left) - executionTime(right))
    this.setData({ schedules, scheduleApiUnavailable, loading: false })
  },
  openTask(event) {
    wx.navigateTo({ url: `/modules/salesman/pages/task-detail/index?id=${event.currentTarget.dataset.id}` })
  }
})
