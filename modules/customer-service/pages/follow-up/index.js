const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getFollowUps } = require('../../api')

const STATUS_TEXT = { BRANCH_ASSIGNED: '网点待处理', SALESMAN_PROCESSING: '业务处理中', PROCESSING: '跟进中', FINISHED: '已完成' }

Page({
  data: {
    records: [], status: 'ALL', loading: true, message: '',
    filters: [{ key: 'ALL', label: '全部' }, { key: 'PROCESSING', label: '跟进中' }, { key: 'FINISHED', label: '完成任务' }]
  },
  onLoad(options) {
    if (['PROCESSING', 'FINISHED'].includes(options.status)) this.setData({ status: options.status })
  },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) {
      return wx.reLaunch({ url: '/pages/auth/login/index' })
    }
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '' })
    getFollowUps(this.data.status).then(rows => {
      const records = rows.map(item => Object.assign({}, item, {
        id: item.orderId || item.id,
        customerName: item.customerName || '未填写',
        branchName: item.branchName || '待网点接收',
        salesmanName: item.salesmanName || '待网点安排',
        statusText: STATUS_TEXT[item.status] || item.statusText || item.status
      }))
      this.setData({ records, loading: false })
    }).catch(error => this.setData({ loading: false, message: error.message }))
  },
  chooseFilter(event) {
    const status = event.currentTarget.dataset.status
    if (status === this.data.status) return
    this.setData({ status }, () => this.refresh())
  },
  openDetail(event) {
    const item = this.data.records[Number(event.currentTarget.dataset.index)]
    if (!item) return
    const query = [
      `id=${encodeURIComponent(item.id)}`,
      `customerName=${encodeURIComponent(item.customerName || '')}`,
      `branchName=${encodeURIComponent(item.branchName || '')}`,
      `salesmanName=${encodeURIComponent(item.salesmanName || '')}`,
      `status=${encodeURIComponent(item.status || '')}`
    ].join('&')
    wx.navigateTo({ url: `/modules/customer-service/pages/business-detail/index?${query}` })
  }
})
