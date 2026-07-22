const { getSession } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getEntrySource } = require('../../../../core/router/entry-source')
const { validateMainlandMobile } = require('../../../../domain/identity/phone')
const { EXPENSE_TIERS } = require('../../../../domain/screening/pre-screen')
const { queryPhoneAttribution } = require('../../../../services/phone-service')
const { submitClientScreening } = require('../../../../services/client-screening-service')
const { saveQualificationDraft, getQualificationDraft, clearQualificationDraft } = require('../../../../core/client/qualification-draft')

const BLOCKING = new Set(['PENDING', 'CONTACTING', 'VERIFYING', 'VERIFIED', 'INVALID_INFO', 'CORRECTING', 'CONFIRMED', 'DISPATCHING', 'ASSIGNED', 'PROCESSING', 'PENDING_VERIFICATION', 'VERIFICATION_RETURNED', 'PENDING_REVIEW', 'PENDING_CONTACT', 'CONTACT_FAILED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'PENDING_SERVICE', 'IN_SERVICE', 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE'])

Page({
  data: {
    stage: 'phone', stageNumber: 1, phone: '', localNumber: '', acceptLocalCard: '',
    expenseTiers: EXPENSE_TIERS, expenseTier: '', attributionLoading: false,
    attributionMessage: '', attributionLocation: '', eligibleCity: '成都', result: null, source: null,
    hasMerchantInvite: false, submitting: false
  },
  onLoad() {
    const session = getSession()
    if (!session || session.defaultRole !== ROLES.CLIENT) return wx.reLaunch({ url: '/pages/auth/register/index' })
    const source = getEntrySource(session.userId)
    const draft = source && getQualificationDraft(session.userId, source.inviteCode)
    this.setData(Object.assign({ source, hasMerchantInvite: Boolean(source && source.inviteCode) }, draft ? {
      stage: draft.stage, stageNumber: draft.stageNumber, phone: draft.phone,
      localNumber: draft.localNumber, acceptLocalCard: draft.acceptLocalCard,
      expenseTier: draft.expenseTier, attributionMessage: draft.attributionMessage,
      attributionLocation: draft.attributionLocation, eligibleCity: draft.eligibleCity
    } : {}))
    requestMyApplications(session).then(applications => {
      const existing = applications.find(item => BLOCKING.has(item.status))
      if (existing) return wx.redirectTo({ url: `/modules/client/pages/application-detail/index?id=${existing.id}` })
      if (source && source.inviteCode) return
      wx.showModal({ title: '请先扫描商家二维码', content: '资料申请只能通过商家提供的专属二维码进入。', showCancel: false, success: () => wx.reLaunch({ url: '/modules/client/pages/home/index' }) })
    }).catch(error => this.showError(error.message))
  },
  onPhoneInput(event) {
    const phone = event.detail.value
    this.setData({ phone, result: null, attributionMessage: '', attributionLocation: '' })
    if (this.queryTimer) clearTimeout(this.queryTimer)
    if (validateMainlandMobile(phone)) this.queryTimer = setTimeout(() => this.queryAttribution(), 300)
  },
  queryAttribution() {
    if (this.data.attributionLoading) return
    if (!validateMainlandMobile(this.data.phone)) return this.showError('请输入正确的 11 位手机号')
    this.setData({ attributionLoading: true, result: null })
    queryPhoneAttribution(this.data.phone).then(data => {
      const location = [data.province, data.city, data.isp].filter(Boolean).join(' ')
      const common = { attributionLoading: false, attributionMessage: data.message || '', attributionLocation: location, eligibleCity: data.eligibleCity || '成都' }
      if (data.isLocal === true) return this.setData(Object.assign(common, { localNumber: 'YES', stage: 'tier', stageNumber: 2 }))
      if (data.isLocal === false) return this.setData(Object.assign(common, { localNumber: 'NO', stage: 'local-card', stageNumber: 2 }))
      this.setData(Object.assign(common, { stage: 'local', stageNumber: 1 }))
    }).catch(error => { this.setData({ attributionLoading: false }); this.showError(error.message) })
  },
  chooseLocalNumber(event) {
    const localNumber = event.currentTarget.dataset.value
    this.setData({ localNumber, acceptLocalCard: '', result: null, stage: localNumber === 'YES' ? 'tier' : 'local-card', stageNumber: 2 })
  },
  chooseAcceptLocalCard(event) {
    if (event.currentTarget.dataset.value !== 'YES') return this.finishRejected('您暂不同意办理本地号码，本次资格申请已结束。')
    this.setData({ acceptLocalCard: 'YES', stage: 'tier', stageNumber: 2, result: null })
  },
  chooseExpenseTier(event) { this.setData({ expenseTier: event.currentTarget.dataset.value, stage: 'commitment', stageNumber: 3, result: null }) },
  chooseCommitment(event) {
    if (event.currentTarget.dataset.value !== 'YES') return this.finishRejected('您暂未接受三年内不销户、不转网、不降套餐的办理要求，本次资格申请已结束。')
    this.submit()
  },
  finishRejected(reason) { this.setData({ stage: 'end', stageNumber: 3, result: { passed: false, ended: true, reasons: [reason] } }) },
  showError(message) { this.setData({ result: { passed: false, reasons: [message] } }) },
  submit() {
    if (this.data.submitting) return
    const source = this.data.source || {}
    this.setData({ submitting: true, stage: 'submitting', result: null })
    submitClientScreening({
      phone: this.data.phone, localNumber: this.data.localNumber === 'YES',
      acceptLocalCard: this.data.localNumber === 'NO' ? this.data.acceptLocalCard === 'YES' : null,
      expenseTier: this.data.expenseTier, commitments: [true, true, true], commitmentAccepted: true,
      source: { inviteCode: source.inviteCode || '' }
    }).then(result => {
      clearQualificationDraft()
      this.setData({ result, submitting: false, stage: result.passed ? 'success' : 'end' })
    })
      .catch(error => this.setData({ submitting: false, stage: 'end', result: { passed: false, reasons: [error.message] } }))
  },
  restart() { clearQualificationDraft(); this.setData({ stage: 'phone', stageNumber: 1, phone: '', localNumber: '', acceptLocalCard: '', expenseTier: '', attributionMessage: '', attributionLocation: '', result: null }) },
  backHome() { wx.reLaunch({ url: '/modules/client/pages/home/index' }) },
  onUnload() {
    if (this.queryTimer) clearTimeout(this.queryTimer)
    const source = this.data.source || {}
    const session = getSession()
    const hasProgress = Boolean(this.data.phone || this.data.localNumber || this.data.acceptLocalCard || this.data.expenseTier)
    if (!this.data.submitting && !this.data.result && hasProgress && session && source.inviteCode) {
      saveQualificationDraft({
        userId: session.userId, inviteCode: source.inviteCode, stage: this.data.stage, stageNumber: this.data.stageNumber,
        phone: this.data.phone, localNumber: this.data.localNumber, acceptLocalCard: this.data.acceptLocalCard,
        expenseTier: this.data.expenseTier, attributionMessage: this.data.attributionMessage,
        attributionLocation: this.data.attributionLocation, eligibleCity: this.data.eligibleCity
      })
    }
  }
})

function requestMyApplications(session) {
  const { request } = require('../../../../services/api-client')
  return request('/v1/applications/me', { session }).then(response => response.applications || [])
}
