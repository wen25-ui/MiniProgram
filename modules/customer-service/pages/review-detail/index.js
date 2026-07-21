const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getCustomerServiceApplication, reviewApplication } = require('../../../../services/client-application-service')

const EXPENSE_TEXT = {
  UNDER_79: '低于79元', FROM_79: '79元以上', FROM_150: '150元以上',
  FROM_250: '250元以上', FROM_400: '400元以上'
}
const COMMITMENT_LABELS = ['三年内不销户', '三年内不转网', '三年内不降套餐']

function yesNo(value, emptyText = '无需选择') {
  if (value === null || typeof value === 'undefined') return emptyText
  return value ? '是' : '否'
}

Page({
  data: { id: '', application: null, commitments: [], serviceMode: '', rejectReason: '', loading: true, submitting: false, message: '' },
  onLoad(options) {
    this.setData({ id: options.id || '' })
    this.loadDetail()
  },
  loadDetail() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    if (!this.data.id) return this.setData({ loading: false, message: '缺少申请编号' })
    getCustomerServiceApplication(this.data.id).then(application => {
      const values = application.commitments || []
      this.setData({
        application: Object.assign({}, application, {
          localNumberText: yesNo(application.localNumber, '未填写'),
          acceptLocalCardText: yesNo(application.acceptLocalCard),
          expenseText: EXPENSE_TEXT[application.expenseTier] || '未填写',
          attributionText: [application.attributionProvince, application.attributionCity].filter(Boolean).join(' ') || '未查询到'
        }),
        commitments: COMMITMENT_LABELS.map((label, index) => ({ label, accepted: Boolean(values[index]) })),
        loading: false,
        message: ''
      })
    }).catch(error => this.setData({ loading: false, message: error.message }))
  },
  onRejectReasonInput(event) { this.setData({ rejectReason: event.detail.value }) },
  chooseServiceMode(event) { this.setData({ serviceMode: event.currentTarget.dataset.mode }) },
  approve() {
    if (this.data.submitting) return
    if (!this.data.serviceMode) return wx.showToast({ title: '请先确认办理方式', icon: 'none' })
    wx.showModal({
      title: '确认问卷内容已核实？',
      content: '确认后申请将进入联系客户流程。',
      confirmText: '核实通过',
      success: result => { if (result.confirm) this.submitReview('APPROVE', '', this.data.serviceMode) }
    })
  },
  reject() {
    const reason = this.data.rejectReason.trim()
    if (!reason) {
      wx.showToast({ title: '请填写内容不符的具体原因', icon: 'none' })
      return
    }
    this.submitReview('REJECT', reason, '')
  },
  submitReview(decision, reason, serviceMode) {
    this.setData({ submitting: true, message: '' })
    reviewApplication(this.data.id, decision, reason, serviceMode).then(() => {
      wx.showToast({ title: decision === 'APPROVE' ? '核实通过' : '已驳回', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    }).catch(error => this.setData({ submitting: false, message: error.message }))
  }
})
