const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getTasks } = require('../../api')
const { taskView } = require('../../task-view')

const FILTERS = [
  { key: '', label: '全部' }, { key: 'WAIT_ASSIGN', label: '待处理' }, { key: 'PROCESSING', label: '办理中' },
  { key: 'VERIFYING', label: '实名核验' }, { key: 'DOCUMENT_PENDING', label: '待提交' },
  { key: 'AUDITING', label: '审核中' }, { key: 'FINISHED', label: '完成' }
]

Page({
  data: { allTasks: [], tasks: [], filters: FILTERS, filter: '', message: '', loading: true },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.SALESMAN)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '' })
    getTasks().then(rows => {
      const allTasks = rows.map(taskView)
      this.setData({ allTasks, loading: false }, () => this.applyFilter(this.data.filter))
    }).catch(error => this.setData({ loading: false, message: error.message }))
  },
  applyFilter(filter) {
    this.setData({ filter, tasks: filter ? this.data.allTasks.filter(item => item.salesmanStatus === filter) : this.data.allTasks })
  },
  chooseFilter(event) { this.applyFilter(event.currentTarget.dataset.filter) },
  openTask(event) { wx.navigateTo({ url: `/modules/salesman/pages/task-detail/index?id=${event.currentTarget.dataset.id}` }) }
})
