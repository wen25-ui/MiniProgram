const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const {
  getTask, acceptTask, recordContact, confirmAppointment, confirmArrival, startTask,
  finishProcessing, uploadResult, abnormalClose, getBranch, transferOrder,
  getPendingTransfers, decideTransfer
} = require('../../api')
const { taskView } = require('../../task-view')

const TERMINAL_STATUSES = ['COMPLETED', 'FINISHED', 'ABNORMAL_CLOSED', 'PROCESSING_FAILED', 'CANCELLED', 'FAILED']

const FAILURE_REASONS = [
  { code: 'NO_ANSWER', label: '无人接听' }, { code: 'POWERED_OFF', label: '电话关机' },
  { code: 'WRONG_NUMBER', label: '电话号码错误' }, { code: 'REJECTED', label: '客户拒接' },
  { code: 'INCONVENIENT', label: '客户暂时不方便' }, { code: 'OTHER', label: '其他原因' }
]
function dateAfter(days) {
  const date = new Date(Date.now() + days * 86400000)
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function historyTime(history, operations) {
  const item = (history || []).find(entry => operations.includes(entry.operation))
  return item ? item.createdAt : ''
}

function buildStages(task) {
  const status = task.status
  const accepted = !['PENDING_ACCEPT', 'WAIT_ASSIGN'].includes(status)
  const processing = ['PROCESSING', 'WAITING_RESULT_UPLOAD', 'DOCUMENT_PENDING', 'PENDING_VERIFICATION', 'AUDITING', 'COMPLETED', 'FINISHED'].includes(status)
  const submitted = ['PENDING_VERIFICATION', 'AUDITING', 'COMPLETED', 'FINISHED'].includes(status)
  const completed = ['COMPLETED', 'FINISHED'].includes(status)
  return [
    { key: 'review', title: '客服审核', active: true, time: task.dispatchedAt || '' },
    { key: 'branch', title: '派遣网点', active: Boolean(task.branchId || task.branchName), time: task.dispatchedAt || '' },
    { key: 'accept', title: '业务员接单', active: accepted, time: task.acceptedAt || historyTime(task.history, ['TASK_ACCEPTED']) },
    { key: 'processing', title: '办理中', active: processing, time: task.startedAt || historyTime(task.history, ['PROCESSING_STARTED']) },
    { key: 'submit', title: '提交凭证', active: submitted, time: task.resultUploadedAt || historyTime(task.history, ['RESULT_UPLOADED']) },
    { key: 'complete', title: '完成', active: completed, time: task.completedAt || '' }
  ]
}

Page({
  data: {
    id: '', task: null, loading: true, operating: false, message: '',
    contactResult: 'CONTACT_SUCCESS', contactRemark: '', contactAddress: '', failureReasons: FAILURE_REASONS,
    failureReasonLabels: FAILURE_REASONS.map(item => item.label), failureReasonIndex: 0,
    appointmentDate: dateAfter(1), appointmentTime: '10:00', serviceAddressInput: '', identityVerified: false,
    resultDescription: '', processingRemark: '', showAbnormal: false, abnormalReason: '',
    showTransfer: false, transferMembers: [], transferLabels: [], transferIndex: 0, transferReason: '',
    stages: [], pendingTransfer: null, transferApiUnavailable: false, operatingTransferId: ''
  },
  onLoad(options) { this.setData({ id: options.id || '' }) },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.SALESMAN)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '' })
    Promise.all([getTask(this.data.id), getBranch().catch(() => null), getPendingTransfers().catch(() => null)]).then(([rawTask, branch, transfers]) => {
      const session = getSession()
      const task = taskView(rawTask)
      const members = branch ? (branch.members || branch.teamMembers || branch.salesmen || []).filter(item => {
        if (Number(item.userId || item.id) === Number(session.userId)) return false
        return task.serviceType !== 'HOME_SERVICE' || item.canFieldService
      }) : []
      const pendingTransfer = (transfers || []).find(item => String(item.orderId || item.applicationId) === String(task.applicationId)) || null
      this.setData({
      task: Object.assign({}, task, {
        branchName: task.branchName || task.storeName || (branch && branch.name) || '未绑定网点',
        salesmanStatusText: task.salesmanStatusText || task.statusText,
        canTransfer: !task.summaryOnly && !TERMINAL_STATUSES.includes(task.status) &&
          !['PENDING_ACCEPT', 'WAIT_ASSIGN', 'TRANSFER_PENDING', 'PENDING_VERIFICATION', 'AUDITING'].includes(task.status)
      }),
      loading: false,
      resultDescription: task.resultRemark || '',
      contactAddress: task.serviceAddress || this.data.contactAddress,
      serviceAddressInput: task.serviceAddress || this.data.serviceAddressInput,
      transferMembers: members,
      transferLabels: members.map(item => `${item.name}（当前 ${item.currentTaskCount || item.taskCount || item.activeTaskCount || 0} 单）`),
      stages: buildStages(task), pendingTransfer, transferApiUnavailable: transfers === null
    })})
      .catch(error => this.setData({ loading: false, message: error.message }))
  },
  input(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }) },
  chooseContactResult(event) { this.setData({ contactResult: event.detail.value }) },
  chooseFailureReason(event) { this.setData({ failureReasonIndex: Number(event.detail.value) }) },
  chooseDate(event) { this.setData({ appointmentDate: event.detail.value }) },
  chooseTime(event) { this.setData({ appointmentTime: event.detail.value }) },
  toggleVerified() { this.setData({ identityVerified: !this.data.identityVerified }) },
  toggleAbnormal() { this.setData({ showAbnormal: !this.data.showAbnormal, abnormalReason: '' }) },
  toggleTransfer() { this.setData({ showTransfer: !this.data.showTransfer, transferReason: '' }) },
  chooseTransferMember(event) { this.setData({ transferIndex: Number(event.detail.value) }) },
  decideIncomingTransfer(event) {
    if (this.data.operatingTransferId) return
    const { transferId, decision } = event.detail
    this.setData({ operatingTransferId: String(transferId), message: '' })
    decideTransfer(transferId, decision).then(() => {
      wx.showToast({ title: decision === 'accept' ? '已接受转接' : '已拒绝转接', icon: 'success' })
      this.setData({ operatingTransferId: '' })
      this.refresh()
    }).catch(error => this.setData({ operatingTransferId: '', message: error.message }))
  },
  copyPhone() {
    if (this.data.task && this.data.task.status === 'PENDING_ACCEPT') return wx.showToast({ title: '请先接收任务', icon: 'none' })
    if (!this.data.task || !this.data.task.customerPhone) return wx.showToast({ title: '客户号码为空', icon: 'none' })
    wx.setClipboardData({ data: this.data.task.customerPhone })
  },
  callCustomer() {
    if (this.data.task && this.data.task.status === 'PENDING_ACCEPT') return wx.showToast({ title: '请先接收任务', icon: 'none' })
    const phone = this.data.task && this.data.task.customerPhone
    if (!phone) return wx.showToast({ title: '客户号码为空', icon: 'none' })
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: () => wx.setClipboardData({ data: phone, success: () => wx.showToast({ title: '未能调起拨号，号码已复制', icon: 'none' }) })
    })
  },
  run(task, successText) {
    if (this.data.operating) return
    this.setData({ operating: true, message: '' })
    task.then(() => {
      wx.showToast({ title: successText, icon: 'success' })
      this.setData({ operating: false, showAbnormal: false, abnormalReason: '', showTransfer: false, transferReason: '' })
      this.refresh()
    }).catch(error => this.setData({ operating: false, message: error.message }))
  },
  accept() { this.run(acceptTask(this.data.id), '任务已接收') },
  submitContact() {
    const failed = this.data.contactResult === 'CONTACT_FAILED'
    const failureReason = failed ? FAILURE_REASONS[this.data.failureReasonIndex].code : ''
    const serviceAddress = String(this.data.contactAddress || '').trim()
    if (!failed && this.data.task.serviceType === 'HOME_SERVICE' && !serviceAddress) return wx.showToast({ title: '请确认客户上门地址', icon: 'none' })
    this.run(recordContact(this.data.id, { result: this.data.contactResult, failureReason, remark: this.data.contactRemark, contactMethod: 'PHONE', serviceAddress }), failed ? '已标记联系失败' : '已记录联系成功')
  },
  confirmAppointment() {
    const appointmentTime = `${this.data.appointmentDate} ${this.data.appointmentTime}:00`
    const serviceAddress = String(this.data.serviceAddressInput || '').trim()
    if (this.data.task.serviceType === 'HOME_SERVICE' && !serviceAddress) {
      return wx.showToast({ title: '请填写上门地址', icon: 'none' })
    }
    if (new Date(appointmentTime.replace(' ', 'T')).getTime() <= Date.now()) {
      return wx.showToast({ title: '办理时间必须晚于当前时间', icon: 'none' })
    }
    this.run(confirmAppointment(this.data.id, appointmentTime, serviceAddress), '办理时间已确认')
  },
  arrive() {
    const title = this.data.task.serviceType === 'HOME_SERVICE' ? '确认已到达上门地点？' : '确认客户已到店？'
    wx.showModal({ title, content: '确认后任务将进入开始办理确认环节。', success: result => { if (result.confirm) this.run(confirmArrival(this.data.id), '已确认到达') } })
  },
  start() {
    wx.showModal({ title: '确认开始办理？', content: '请在客户或现场工作人员确认后开始办理。', success: result => { if (result.confirm) this.run(startTask(this.data.id), '已开始办理') } })
  },
  finish() {
    wx.showModal({ title: '确认办理环节已完成？', content: '确认后还需要上传办理结果，任务不会立即结束。', success: result => { if (result.confirm) this.run(finishProcessing(this.data.id, this.data.processingRemark), '请上传办理结果') } })
  },
  uploadResult() { this.run(uploadResult(this.data.id, this.data.identityVerified, this.data.resultDescription), '结果已提交') },
  submitTransfer() {
    const member = this.data.transferMembers[this.data.transferIndex]
    const reason = this.data.transferReason.trim()
    if (!member) return wx.showToast({ title: '请选择同网点接收人', icon: 'none' })
    if (!reason) return wx.showToast({ title: '请填写转接原因', icon: 'none' })
    this.run(transferOrder(this.data.task.applicationId, member.userId || member.id, reason), '转接申请已提交')
  },
  abnormalClose() {
    wx.showModal({ title: '确认异常结束任务？', content: '该操作不会将任务标记为正常完成，原因会永久保留。', confirmColor: '#bd3f3f', success: result => { if (result.confirm) this.run(abnormalClose(this.data.id, this.data.abnormalReason), '任务已异常结束') } })
  }
})
