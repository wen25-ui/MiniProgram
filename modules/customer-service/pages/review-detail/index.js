const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const {
  getCustomerServiceApplication, startCustomerContact, recordContactResult,
  verifyCustomerInfo, recordCustomerIntention, correctCustomerInfo, selectServiceType
} = require('../../../../services/client-application-service')

const EXPENSE_TEXT = { UNDER_79: '低于79元', FROM_79: '79元以上', FROM_150: '150元以上', FROM_250: '250元以上', FROM_400: '400元以上' }
const EXPENSE_OPTIONS = [
  { value: 'UNDER_79', label: '低于79元' }, { value: 'FROM_79', label: '79元以上' },
  { value: 'FROM_150', label: '150元以上' }, { value: 'FROM_250', label: '250元以上' },
  { value: 'FROM_400', label: '400元以上' }
]
const COMMITMENT_LABELS = ['三年内不销户', '三年内不转网', '三年内不降套餐']

function yesNo(value, emptyText = '无需选择') {
  if (value === null || typeof value === 'undefined') return emptyText
  return value ? '是' : '否'
}

Page({
  data: {
    id: '', application: null, commitments: [], serviceMode: '', loading: true, submitting: false, message: '',
    pendingAction: '', actionTitle: '', actionPlaceholder: '', actionRemark: '',
    expenseOptions: EXPENSE_OPTIONS, correction: { localNumber: true, acceptLocalCard: null, expenseTier: '', commitments: [true, true, true], remark: '' }
  },
  onLoad(options) { this.setData({ id: options.id || '' }); this.loadDetail() },
  loadDetail() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    if (!this.data.id) return this.setData({ loading: false, message: '缺少申请编号' })
    getCustomerServiceApplication(this.data.id).then(application => {
      const values = application.commitments || []
      this.setData({
        application: Object.assign({}, application, {
          localNumberText: yesNo(application.localNumber, '未填写'), acceptLocalCardText: yesNo(application.acceptLocalCard),
          expenseText: EXPENSE_TEXT[application.expenseTier] || '未填写',
          attributionText: [application.attributionProvince, application.attributionCity].filter(Boolean).join(' ') || '未查询到'
        }),
        serviceMode: application.serviceMode || '',
        commitments: COMMITMENT_LABELS.map((label, index) => ({ label, accepted: Boolean(values[index]) })),
        correction: {
          localNumber: application.localNumber !== false,
          acceptLocalCard: application.localNumber === false ? Boolean(application.acceptLocalCard) : null,
          expenseTier: application.expenseTier || '', commitments: COMMITMENT_LABELS.map((_, index) => Boolean(values[index])), remark: ''
        },
        pendingAction: '', actionTitle: '', actionPlaceholder: '', actionRemark: '', loading: false, submitting: false, message: ''
      })
    }).catch(error => this.setData({ loading: false, submitting: false, message: error.message }))
  },
  onActionRemarkInput(event) { this.setData({ actionRemark: event.detail.value }) },
  openActionForm(action, title, placeholder) { this.setData({ pendingAction: action, actionTitle: title, actionPlaceholder: placeholder, actionRemark: '' }) },
  cancelActionForm() { this.setData({ pendingAction: '', actionTitle: '', actionPlaceholder: '', actionRemark: '' }) },
  chooseCorrectionLocal(event) {
    const localNumber = event.currentTarget.dataset.value === 'YES'
    this.setData({ 'correction.localNumber': localNumber, 'correction.acceptLocalCard': localNumber ? null : this.data.correction.acceptLocalCard })
  },
  chooseCorrectionCard(event) { this.setData({ 'correction.acceptLocalCard': event.currentTarget.dataset.value === 'YES' }) },
  chooseCorrectionTier(event) { this.setData({ 'correction.expenseTier': event.currentTarget.dataset.value }) },
  toggleCorrectionCommitment(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`correction.commitments[${index}]`]: !this.data.correction.commitments[index] })
  },
  onCorrectionRemarkInput(event) { this.setData({ 'correction.remark': event.detail.value }) },
  chooseServiceMode(event) { this.setData({ serviceMode: event.currentTarget.dataset.mode }) },
  run(task, title) {
    if (this.data.submitting) return
    this.setData({ submitting: true, message: '' })
    task.then(() => { wx.showToast({ title, icon: 'success' }); this.loadDetail() })
      .catch(error => this.setData({ submitting: false, message: error.message }))
  },
  openContactActions() {
    const application = this.data.application || {}
    const phone = String(application.phone || '')
    if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '客户手机号无效', icon: 'none' })
    wx.showActionSheet({
      itemList: ['拨打客户电话', '复制客户号码'],
      success: result => {
        if (result.tapIndex === 0) {
          wx.makePhoneCall({ phoneNumber: phone, success: () => this.afterContactAction('已打开拨号界面') })
        } else if (result.tapIndex === 1) {
          wx.setClipboardData({ data: phone, success: () => this.afterContactAction('号码已复制') })
        }
      }
    })
  },
  afterContactAction(title) {
    if (this.data.application.status === 'PENDING') return this.run(startCustomerContact(this.data.id), title)
    wx.showToast({ title, icon: 'success' })
  },
  contacted() { this.run(recordContactResult(this.data.id, 'CONTACTED', ''), '进入信息核实') },
  unreachable() { this.openActionForm('UNREACHABLE', '暂未联系成功', '填写本次未联系成功的具体情况') },
  verifyValid() { this.run(verifyCustomerInfo(this.data.id, 'VERIFIED', ''), '信息核实完成') },
  verifyInvalid() { this.openActionForm('INVALID_INFO', '信息不属实', '填写不属实的具体信息和核实情况') },
  willing() { this.run(recordCustomerIntention(this.data.id, 'WILLING', ''), '已记录办理意愿') },
  unwilling() { this.openActionForm('UNWILLING', '客户不办理', '填写客户取消办理的原因或沟通情况') },
  submitActionForm() {
    const remark = this.data.actionRemark.trim()
    if (!remark) return wx.showToast({ title: '请填写处理说明', icon: 'none' })
    if (this.data.pendingAction === 'UNREACHABLE') return this.run(recordContactResult(this.data.id, 'UNREACHABLE', remark), '已记录联系结果')
    if (this.data.pendingAction === 'INVALID_INFO') return this.run(verifyCustomerInfo(this.data.id, 'INVALID_INFO', remark), '已标记信息异常')
    if (this.data.pendingAction === 'UNWILLING') return this.run(recordCustomerIntention(this.data.id, 'UNWILLING', remark), '流程已取消')
  },
  correctInfo() {
    const correction = this.data.correction
    if (!correction.localNumber && correction.acceptLocalCard !== true) return wx.showToast({ title: '非本地号码需确认接受本地卡', icon: 'none' })
    if (!correction.expenseTier) return wx.showToast({ title: '请选择套餐档位', icon: 'none' })
    if (!correction.commitments.every(Boolean)) return wx.showToast({ title: '请确认全部三年履约要求', icon: 'none' })
    const correctedInfo = {
      localNumber: correction.localNumber, acceptLocalCard: correction.localNumber ? null : correction.acceptLocalCard,
      expenseTier: correction.expenseTier, commitments: correction.commitments, remark: correction.remark.trim()
    }
    this.run(correctCustomerInfo(this.data.id, correctedInfo, correction.remark.trim()), '客户信息已更正')
  },
  confirmServiceType() {
    if (!this.data.serviceMode) return wx.showToast({ title: '请选择办理方式', icon: 'none' })
    this.run(selectServiceType(this.data.id, this.data.serviceMode), '办理方式已确认')
  }
})
