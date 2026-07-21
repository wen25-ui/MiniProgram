const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getCustomerServiceApplications, getCustomerWorkItems, getCustomerVerifications } = require('../../../../services/client-application-service')

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'review', label: '待审核' },
  { key: 'pendingDispatch', label: '待派遣' },
  { key: 'dispatched', label: '已派遣' },
  { key: 'pendingVerification', label: '待核销' },
  { key: 'completed', label: '核销完成' }
]

const GROUPS = {
  review: ['PENDING_REVIEW'],
  pendingDispatch: ['PENDING_DISPATCH'],
  dispatched: ['PENDING_SERVICE', 'IN_SERVICE', 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE', 'VERIFICATION_RETURNED'],
  pendingVerification: ['PENDING_VERIFICATION'],
  completed: ['SERVICE_COMPLETED']
}

Page({
  data: { records: [], filtered: [], filter: 'all', filters: FILTERS, loading: true, message: '' },
  onLoad(options) {
    const filter = FILTERS.some(item => item.key === options.filter) ? options.filter : 'all'
    this.setData({ filter })
  },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '' })
    Promise.all([getCustomerServiceApplications(), getCustomerWorkItems(), getCustomerVerifications()]).then(([reviews, workItems, verifications]) => {
      const records = reviews.concat(workItems, verifications).reduce((list, item) => {
        if (!list.some(record => record.id === item.id)) list.push(item)
        return list
      }, []).sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
      this.setData({ records, loading: false })
      this.applyFilter(this.data.filter)
    }).catch(error => this.setData({ loading: false, message: error.message }))
  },
  applyFilter(filter) {
    const statuses = GROUPS[filter]
    this.setData({ filter, filtered: statuses ? this.data.records.filter(item => statuses.includes(item.status)) : this.data.records })
  },
  chooseFilter(event) { this.applyFilter(event.currentTarget.dataset.filter) }
})
