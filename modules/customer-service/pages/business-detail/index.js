const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getCustomerWorkItem } = require('../../../../services/client-application-service')

const EXPENSE_TEXT = { UNDER_79: '低于79元', FROM_79: '79元以上', FROM_150: '150元以上', FROM_250: '250元以上', FROM_400: '400元以上' }

Page({
  data: { id: '', application: null, loading: true, message: '' },
  onLoad(options) { this.setData({ id: options.id || '' }); this.loadDetail() },
  loadDetail() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    if (!this.data.id) return this.setData({ loading: false, message: '缺少业务编号' })
    getCustomerWorkItem(this.data.id).then(application => this.setData({
      application: Object.assign({}, application, { expenseText: EXPENSE_TEXT[application.expenseTier] || '未填写' }),
      loading: false, message: ''
    })).catch(error => this.setData({ loading: false, message: error.message }))
  }
})
