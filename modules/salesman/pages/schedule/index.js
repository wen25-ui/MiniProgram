const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getSalesmanTasks } = require('../../../../services/client-application-service')

const CATEGORIES = [
  { key: 'pending', label: '待完成任务' },
  { key: 'completed', label: '已完成任务' },
  { key: 'rejected', label: '被驳回任务' }
]
const TERMINAL_STATUSES = ['COMPLETED', 'PROCESSING_FAILED', 'CANCELLED', 'ABNORMAL_CLOSED']

function executionTime(task) {
  const value = String(task.appointmentTime || '').replace(/-/g, '/')
  const timestamp = value ? new Date(value).getTime() : NaN
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp
}

function scheduleView(task) {
  const parts = String(task.appointmentTime || '').split(' ')
  return Object.assign({}, task, {
    executionDate: parts[0] || '日期待确认',
    executionClock: parts[1] ? parts[1].slice(0, 5) : '时间待确认',
    scheduleStatusText: task.verificationReason ? '被驳回' : task.statusText
  })
}

function taskCategory(task) {
  if (task.status === 'WAITING_RESULT_UPLOAD' && task.verificationReason) return 'rejected'
  if (task.status === 'COMPLETED') return 'completed'
  return TERMINAL_STATUSES.includes(task.status) ? '' : 'pending'
}

Page({
  data: {
    allTasks: [], tasks: [], categories: CATEGORIES, category: 'pending',
    loading: true, message: ''
  },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.SALESMAN)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '' })
    getSalesmanTasks().then(tasks => {
      const allTasks = tasks
        .filter(task => task.serviceType === 'HOME_SERVICE')
        .sort((left, right) => executionTime(left) - executionTime(right))
        .map(scheduleView)
      this.setData({ allTasks, loading: false }, () => this.filterTasks())
    }).catch(error => this.setData({ loading: false, message: error.message }))
  },
  chooseCategory(event) {
    this.setData({ category: event.currentTarget.dataset.category }, () => this.filterTasks())
  },
  filterTasks() {
    const category = this.data.category
    this.setData({ tasks: this.data.allTasks.filter(task => taskCategory(task) === category) })
  },
  openTask(event) {
    wx.navigateTo({ url: `/modules/salesman/pages/task-detail/index?id=${event.currentTarget.dataset.id}` })
  }
})
