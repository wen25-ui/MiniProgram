const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const {
  getSalesmanTask, acceptSalesmanTask, recordSalesmanContact,
  confirmSalesmanAppointment, confirmSalesmanArrival, startSalesmanTask,
  finishSalesmanProcessing, uploadSalesmanResult, abnormalCloseSalesmanTask
} = require('../../../../services/client-application-service')

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

Page({
  data: {
    id: '', task: null, loading: true, operating: false, message: '',
    contactResult: 'CONTACT_SUCCESS', contactRemark: '', contactAddress: '', failureReasons: FAILURE_REASONS,
    failureReasonLabels: FAILURE_REASONS.map(item => item.label), failureReasonIndex: 0,
    appointmentDate: dateAfter(1), appointmentTime: '10:00', serviceAddressInput: '', identityVerified: false,
    resultDescription: '', processingRemark: '', showAbnormal: false, abnormalReason: ''
  },
  onLoad(options) { this.setData({ id: options.id || '' }) },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.SALESMAN)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '' })
    getSalesmanTask(this.data.id).then(task => this.setData({
      task,
      loading: false,
      resultDescription: task.resultRemark || '',
      contactAddress: task.serviceAddress || this.data.contactAddress,
      serviceAddressInput: task.serviceAddress || this.data.serviceAddressInput
    }))
      .catch(error => this.setData({ loading: false, message: error.message }))
  },
  input(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }) },
  chooseContactResult(event) { this.setData({ contactResult: event.detail.value }) },
  chooseFailureReason(event) { this.setData({ failureReasonIndex: Number(event.detail.value) }) },
  chooseDate(event) { this.setData({ appointmentDate: event.detail.value }) },
  chooseTime(event) { this.setData({ appointmentTime: event.detail.value }) },
  toggleVerified() { this.setData({ identityVerified: !this.data.identityVerified }) },
  toggleAbnormal() { this.setData({ showAbnormal: !this.data.showAbnormal, abnormalReason: '' }) },
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
      this.setData({ operating: false, showAbnormal: false, abnormalReason: '' })
      this.refresh()
    }).catch(error => this.setData({ operating: false, message: error.message }))
  },
  accept() { this.run(acceptSalesmanTask(this.data.id), '任务已接收') },
  submitContact() {
    const failed = this.data.contactResult === 'CONTACT_FAILED'
    const failureReason = failed ? FAILURE_REASONS[this.data.failureReasonIndex].code : ''
    const serviceAddress = String(this.data.contactAddress || '').trim()
    if (!failed && this.data.task.serviceType === 'HOME_SERVICE' && !serviceAddress) return wx.showToast({ title: '请确认客户上门地址', icon: 'none' })
    this.run(recordSalesmanContact(this.data.id, { result: this.data.contactResult, failureReason, remark: this.data.contactRemark, contactMethod: 'PHONE', serviceAddress }), failed ? '已标记联系失败' : '已记录联系成功')
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
    this.run(confirmSalesmanAppointment(this.data.id, appointmentTime, serviceAddress), '办理时间已确认')
  },
  arrive() {
    const title = this.data.task.serviceType === 'HOME_SERVICE' ? '确认已到达上门地点？' : '确认客户已到店？'
    wx.showModal({ title, content: '确认后任务将进入开始办理确认环节。', success: result => { if (result.confirm) this.run(confirmSalesmanArrival(this.data.id), '已确认到达') } })
  },
  start() {
    wx.showModal({ title: '确认开始办理？', content: '请在客户或现场工作人员确认后开始办理。', success: result => { if (result.confirm) this.run(startSalesmanTask(this.data.id), '已开始办理') } })
  },
  finish() {
    wx.showModal({ title: '确认办理环节已完成？', content: '确认后还需要上传办理结果，任务不会立即结束。', success: result => { if (result.confirm) this.run(finishSalesmanProcessing(this.data.id, this.data.processingRemark), '请上传办理结果') } })
  },
  uploadResult() { this.run(uploadSalesmanResult(this.data.id, this.data.identityVerified, this.data.resultDescription), '结果已提交') },
  abnormalClose() {
    wx.showModal({ title: '确认异常结束任务？', content: '该操作不会将任务标记为正常完成，原因会永久保留。', confirmColor: '#bd3f3f', success: result => { if (result.confirm) this.run(abnormalCloseSalesmanTask(this.data.id, this.data.abnormalReason), '任务已异常结束') } })
  }
})
