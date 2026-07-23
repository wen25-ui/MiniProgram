const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getFollowUpDetail } = require('../../api')

const FINISHED = ['FINISHED', 'COMPLETED', 'SERVICE_COMPLETED', 'CLOSED']
const PROCESSING = ['SALESMAN_PROCESSING', 'PROCESSING', 'PENDING_VERIFICATION', 'VERIFICATION_RETURNED']

function historyTime(history, actions) {
  const entry = (history || []).find(item => actions.includes(item.actionCode))
  return entry ? entry.createdAt : ''
}

Page({
  data: { id: '', context: {}, application: null, stages: [], loading: true, message: '' },
  onLoad(options) {
    this.setData({
      id: options.id || '',
      context: {
        customerName: decodeURIComponent(options.customerName || ''),
        branchName: decodeURIComponent(options.branchName || ''),
        salesmanName: decodeURIComponent(options.salesmanName || ''),
        status: decodeURIComponent(options.status || '')
      }
    })
    this.loadDetail()
  },
  loadDetail() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) {
      return wx.reLaunch({ url: '/pages/auth/login/index' })
    }
    if (!this.data.id) return this.setData({ loading: false, message: '缺少项目编号' })
    this.setData({ loading: true, message: '' })
    getFollowUpDetail(this.data.id).then(application => {
      const status = this.data.context.status || application.status
      const branchName = this.data.context.branchName || application.branchName || application.assignedStoreName || '待网点接收'
      const salesmanName = this.data.context.salesmanName || application.salesmanName || application.handlerName || '待网点安排'
      const branchAssigned = branchName !== '待网点接收'
      const processing = PROCESSING.includes(status) || Boolean(application.task && application.task.assigneeUserId)
      const finished = FINISHED.includes(status)
      const stages = [
        { key: 'review', title: '审核完成', active: true, time: historyTime(application.history, ['REVIEW_APPROVED', 'SERVICE_MODE_CONFIRMED', 'ASSIGN_BRANCH']) || application.createdAt },
        { key: 'branch', title: '派遣网点', active: branchAssigned, time: historyTime(application.history, ['ASSIGN_BRANCH', 'STORE_ASSIGNED']) },
        { key: 'processing', title: '业务处理中', active: processing || finished, time: application.task ? (application.task.acceptedAt || application.task.startedAt) : '' },
        { key: 'finished', title: '完成', active: finished, time: application.task ? application.task.completedAt : application.updatedAt }
      ]
      this.setData({
        application: Object.assign({}, application, {
          customerName: this.data.context.customerName || application.customerName || '未填写',
          branchName,
          salesmanName,
          currentProcessingStatus: application.task ? application.task.statusText : application.statusText
        }),
        stages,
        loading: false
      })
    }).catch(error => this.setData({ loading: false, message: error.message }))
  },
  urge() {
    // TODO: 对接客服催办接口后提交催办记录。
    wx.showToast({ title: '催办接口待后端提供', icon: 'none' })
  },
  reassign() {
    // TODO: 对接异常重新派遣接口，并由后端校验允许重新派遣的状态。
    wx.showToast({ title: '重新派遣接口待后端提供', icon: 'none' })
  }
})
