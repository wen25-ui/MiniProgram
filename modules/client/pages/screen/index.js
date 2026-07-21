const { getSession } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getEntrySource } = require('../../../../core/router/entry-source')
const { validateMainlandMobile } = require('../../../../domain/identity/phone')
const { EXPENSE_TIERS } = require('../../../../domain/screening/pre-screen')
const { submitClientScreening } = require('../../../../services/client-screening-service')
const BLOCKING_STATUSES = new Set(['PENDING_REVIEW', 'PENDING_CONTACT', 'CONTACT_FAILED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'PENDING_SERVICE', 'IN_SERVICE', 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE', 'PENDING_VERIFICATION', 'VERIFICATION_RETURNED'])

Page({
  data: {
    phone: '', localNumber: '', acceptLocalCard: '',
    expenseTiers: EXPENSE_TIERS, expenseTier: '', commitments: [false, false, false],
    allCommitmentsAccepted: false, result: null, source: null, hasMerchantInvite: false, submitting: false, existingApplicationId: ''
  },
  onLoad() {
    const session = getSession()
    if (!session || session.defaultRole !== ROLES.CLIENT) {
      wx.reLaunch({ url: '/pages/auth/register/index' })
      return
    }
    const source = getEntrySource(session.userId)
    this.setData({ source, hasMerchantInvite: Boolean(source && source.inviteCode) })
    requestMyApplications(session).then(applications => {
      const existing = applications.find(item => BLOCKING_STATUSES.has(item.status))
      if (existing) {
        this.setData({ existingApplicationId: existing.id })
        wx.redirectTo({ url: `/modules/client/pages/application-detail/index?id=${existing.id}` })
        return
      }
      if (source && source.inviteCode) return
      wx.showModal({
        title: '请先扫描商家二维码',
        content: '资料申请只能通过商家提供的专属二维码进入。',
        showCancel: false,
        success: () => wx.reLaunch({ url: '/modules/client/pages/home/index' })
      })
    }).catch(error => {
      this.setData({ result: { passed: false, reasons: [error.message] } })
    })
  },
  onPhoneInput(event) {
    this.setData({ phone: event.detail.value, result: null })
  },
  chooseLocalNumber(event) {
    const localNumber = event.currentTarget.dataset.value
    this.setData({ localNumber, acceptLocalCard: localNumber === 'YES' ? '' : this.data.acceptLocalCard, result: null })
  },
  chooseAcceptLocalCard(event) { this.setData({ acceptLocalCard: event.currentTarget.dataset.value, result: null }) },
  chooseExpenseTier(event) { this.setData({ expenseTier: event.currentTarget.dataset.value, result: null }) },
  toggleCommitment(event) {
    const index = Number(event.currentTarget.dataset.index)
    const commitments = this.data.commitments.slice()
    commitments[index] = !commitments[index]
    this.setData({ commitments, allCommitmentsAccepted: commitments.every(Boolean), result: null })
  },
  submit() {
    if (this.data.submitting) return
    if (this.data.existingApplicationId) {
      wx.redirectTo({ url: `/modules/client/pages/application-detail/index?id=${this.data.existingApplicationId}` })
      return
    }
    if (!this.data.hasMerchantInvite) {
      this.setData({ result: { passed: false, reasons: ['请先扫描商家提供的二维码，再提交资格申请'] } })
      return
    }
    if (!validateMainlandMobile(this.data.phone)) {
      this.setData({ result: { passed: false, reasons: ['请输入正确的 11 位手机号'] } })
      return
    }
    if (!this.data.localNumber || (this.data.localNumber === 'NO' && !this.data.acceptLocalCard)) {
      this.setData({ result: { passed: false, reasons: ['请完整回答号码归属地及是否接受新开卡'] } })
      return
    }
    if (!this.data.expenseTier) {
      this.setData({ result: { passed: false, reasons: ['请选择个人（全家）套餐档位'] } })
      return
    }
    if (!this.data.allCommitmentsAccepted) {
      this.setData({ result: { passed: false, reasons: ['请勾选并确认全部三项履约要求'] } })
      return
    }
    this.setData({ submitting: true, result: null })
    const source = this.data.source || {}
    submitClientScreening({
      phone: this.data.phone,
      localNumber: this.data.localNumber === 'YES',
      acceptLocalCard: this.data.localNumber === 'NO' ? this.data.acceptLocalCard === 'YES' : null,
      expenseTier: this.data.expenseTier,
      commitments: this.data.commitments, commitmentAccepted: this.data.allCommitmentsAccepted,
      source: { inviteCode: source.inviteCode || '' }
    }).then(result => {
      this.setData({ result, submitting: false, existingApplicationId: result.id || '' })
      if (result.id) wx.redirectTo({ url: `/modules/client/pages/application-detail/index?id=${result.id}` })
    })
      .catch(error => this.setData({ submitting: false, result: { passed: false, reasons: [error.message] } }))
  },
  backHome() { wx.navigateBack() }
})

function requestMyApplications(session) {
  const { request } = require('../../../../services/api-client')
  return request('/v1/applications/me', { session }).then(response => response.applications || [])
}
