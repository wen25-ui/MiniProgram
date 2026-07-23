const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getBranchPendingOrders, grabOrder } = require('../../api')

Page({
  data: { orders: [], loading: true, grabbingId: '', message: '' },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.SALESMAN)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '' })
    getBranchPendingOrders().then(rows => {
      const orders = rows.map(item => {
        const serviceType = item.serviceType || item.businessType
        return Object.assign({}, item, {
          id: item.orderId || item.id,
          customerName: item.customerName || '客户',
          serviceType,
          businessType: serviceType === 'HOME_SERVICE' ? '外派办理任务' : '到店办理任务',
          publishedAt: item.publishedAt || item.createdAt || item.updatedAt || '未记录',
          expectedIncome: item.expectedIncome === undefined ? item.expectedCommission : item.expectedIncome
        })
      })
      this.setData({ orders, loading: false, grabbingId: '' })
    }).catch(error => this.setData({ loading: false, grabbingId: '', message: error.message }))
  },
  grab(event) {
    if (this.data.grabbingId) return
    const orderId = event.currentTarget.dataset.id
    this.setData({ grabbingId: String(orderId), message: '' })
    grabOrder(orderId).then(() => {
      wx.showToast({ title: '抢单成功', icon: 'success' })
      wx.redirectTo({ url: '/modules/salesman/pages/tasks/index' })
    }).catch(error => {
      const conflict = /已被|抢走|already|claimed/i.test(error.message || '')
      this.setData({ grabbingId: '', message: conflict ? '订单已被其他业务员抢走' : error.message })
    })
  }
})
