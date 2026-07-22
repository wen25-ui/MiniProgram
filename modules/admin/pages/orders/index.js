const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { listOrders } = require('../../../../services/admin-service')

const FILTERS = [{ key: '', label: '全部' }, { key: 'PENDING', label: '待审核' }, { key: 'CONTACTING', label: '联系客户' }, { key: 'VERIFYING', label: '信息核实' }, { key: 'CONFIRMED', label: '确认办理' }, { key: 'ASSIGNED', label: '已派单' }, { key: 'PROCESSING', label: '处理中' }, { key: 'COMPLETED', label: '完成' }]

Page({
  data: { filters: FILTERS, status: '', orders: [], loading: true, message: '' },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.ADMIN)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.refresh()
  },
  refresh() { this.setData({ loading: true, message: '' }); listOrders(this.data.status).then(orders => this.setData({ orders, loading: false })).catch(error => this.setData({ loading: false, message: error.message })) },
  chooseStatus(event) { this.setData({ status: event.currentTarget.dataset.status }, () => this.refresh()) },
  openDetail(event) { wx.navigateTo({ url: `/modules/admin/pages/order-detail/index?id=${event.currentTarget.dataset.id}` }) }
})
