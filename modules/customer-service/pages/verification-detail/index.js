const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getCustomerVerification, verifyFulfillment } = require('../../../../services/client-application-service')

const EXPENSE = { UNDER_79: '低于79元', FROM_79: '79元以上', FROM_150: '150元以上', FROM_250: '250元以上', FROM_400: '400元以上' }

Page({
  data: { id: '', verification: null, customerConfirmed: false, returnReason: '', loading: true, submitting: false, message: '' },
  onLoad(options) { this.setData({ id: options.id || '' }); this.loadDetail() },
  loadDetail() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    getCustomerVerification(this.data.id).then(verification => this.setData({
      verification: Object.assign({}, verification, { expenseText: EXPENSE[verification.expenseTier] || '未填写' }), loading: false
    })).catch(error => this.setData({ loading: false, message: error.message }))
  },
  toggleCustomerConfirmed() { this.setData({ customerConfirmed: !this.data.customerConfirmed }) },
  onReasonInput(event) { this.setData({ returnReason: event.detail.value }) },
  approve() {
    if (!this.data.customerConfirmed) return wx.showToast({ title: '请先与客户确认办理完成', icon: 'none' })
    this.submit('APPROVE', '')
  },
  returnForUpdate() {
    const reason = this.data.returnReason.trim()
    if (!reason) return wx.showToast({ title: '请填写退回原因', icon: 'none' })
    this.submit('RETURN', reason)
  },
  submit(decision, reason) {
    if (this.data.submitting) return
    this.setData({ submitting: true, message: '' })
    verifyFulfillment(this.data.id, decision, reason, this.data.customerConfirmed).then(() => {
      wx.showToast({ title: decision === 'APPROVE' ? '核销完成' : '已退回补充', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    }).catch(error => this.setData({ submitting: false, message: error.message }))
  }
})
