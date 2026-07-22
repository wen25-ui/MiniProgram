const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getCustomerServiceApplications } = require('../../../../services/client-application-service')

Page({
  data: {
    applications: [], filtered: [], filter: 'all', message: '', loading: true,
    filters: [
      { key: 'all', label: '全部' }, { key: 'pending', label: '待审核' },
      { key: 'contacting', label: '联系中' }, { key: 'recontact', label: '待重联' },
      { key: 'verifying', label: '核实中' }, { key: 'decision', label: '待确认/修正' }
    ]
  },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '' })
    getCustomerServiceApplications()
      .then(applications => this.setData({ applications, loading: false }, () => this.applyFilter(this.data.filter)))
      .catch(error => this.setData({ loading: false, message: error.message }))
  },
  applyFilter(filter) {
    const rules = {
      pending: item => item.status === 'PENDING',
      contacting: item => item.status === 'CONTACTING' && !item.needsRecontact,
      recontact: item => item.needsRecontact,
      verifying: item => item.status === 'VERIFYING',
      decision: item => ['VERIFIED', 'INVALID_INFO', 'CORRECTING'].includes(item.status)
    }
    const matcher = rules[filter]
    this.setData({ filter, filtered: matcher ? this.data.applications.filter(matcher) : this.data.applications })
  },
  chooseFilter(event) { this.applyFilter(event.currentTarget.dataset.filter) },
  openDetail(event) {
    wx.navigateTo({ url: `/modules/customer-service/pages/review-detail/index?id=${event.currentTarget.dataset.id}` })
  }
})
