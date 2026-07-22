const { getSession } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { request } = require('../../../../services/api-client')
const { clearEntrySource } = require('../../../../core/router/entry-source')
const { clearQualificationDraft } = require('../../../../core/client/qualification-draft')

const COMMITMENT_LABELS = {
  legacy: ['三年内不销户', '三年内不转网', '三年内不换号', '三年内不改基础套餐'],
  'screening-v3': ['三年内不销户', '三年内不转网', '三年内不降套餐'],
  'screening-v4': ['三年内不销户', '三年内不转网', '三年内不降套餐']
}

function yesNo(value, emptyText = '无需选择') {
  if (value === null || typeof value === 'undefined') return emptyText
  return value ? '是' : '否'
}

Page({
  data: { id: '', application: null, commitments: [], loading: true, message: '', withdrawing: false },
  onLoad(options) {
    this.setData({ id: options.id || '' })
    this.loadDetail()
  },
  loadDetail() {
    const session = getSession()
    if (!session || session.defaultRole !== ROLES.CLIENT) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    if (!this.data.id) {
      this.setData({ loading: false, message: '缺少申请编号' })
      return
    }
    this.setData({ loading: true, message: '' })
    request(`/v1/applications/${this.data.id}`, { session }).then(response => {
      const application = response.application
      const values = application.commitments || []
      this.setData({
        application: Object.assign({}, application, {
          localNumberText: yesNo(application.localNumber, '未填写'),
          acceptLocalCardText: yesNo(application.acceptLocalCard),
          serviceModeText: { HOME_SERVICE: '上门办理', STORE_SERVICE: '营业厅办理' }[application.serviceMode] || '待确认'
        }),
        commitments: (COMMITMENT_LABELS[application.ruleVersion] || COMMITMENT_LABELS.legacy).map((label, index) => ({ label, accepted: Boolean(values[index]) })),
        loading: false
      })
    }).catch(error => this.setData({ loading: false, message: error.message }))
  },
  withdraw() {
    if (this.data.withdrawing || !this.data.application || !this.data.application.canWithdraw) return
    wx.showModal({
      title: '确认撤回申请？',
      content: '撤回后当前申请将终止，原资料不可恢复，但您可以重新提交新申请。',
      confirmText: '确认撤回', confirmColor: '#d14343',
      success: result => {
        if (!result.confirm) return
        const session = getSession()
        this.setData({ withdrawing: true })
        request(`/v1/applications/${this.data.id}/withdraw`, { method: 'POST', session, data: {} }).then(() => {
          clearEntrySource()
          clearQualificationDraft()
          wx.showToast({ title: '申请已撤回', icon: 'success' })
          this.setData({ withdrawing: false })
          this.loadDetail()
        }).catch(error => this.setData({ withdrawing: false, message: error.message }))
      }
    })
  },
  reapply() { wx.redirectTo({ url: '/modules/client/pages/qualification/index' }) }
})
