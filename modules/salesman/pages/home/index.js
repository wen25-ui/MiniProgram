const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getTasks, getBranch, getPendingTransfers, decideTransfer } = require('../../api')
const { taskView } = require('../../task-view')

Page({
  data: {
    stats: { pending: 0, processing: 0, submitting: 0, completed: 0 },
    income: { estimated: '0.00', completed: '0.00' }, branchName: '暂未绑定网点',
    tasks: [], pendingTransfers: [], transferApiUnavailable: false, operatingTransferId: '',
    loading: true, message: ''
  },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.SALESMAN)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '' })
    Promise.all([getTasks(), getBranch(), getPendingTransfers().catch(() => null)]).then(([rows, branch, transfers]) => {
      const tasks = rows.map(taskView)
      const money = (items, fields) => items.reduce((total, item) => {
        const field = fields.find(name => item[name] !== undefined && item[name] !== null)
        return total + Number(field ? item[field] : 0)
      }, 0).toFixed(2)
      this.setData({
        stats: {
          pending: tasks.filter(item => item.salesmanStatus === 'WAIT_ASSIGN').length,
          processing: tasks.filter(item => ['PROCESSING', 'VERIFYING'].includes(item.salesmanStatus)).length,
          submitting: tasks.filter(item => ['DOCUMENT_PENDING', 'AUDITING'].includes(item.salesmanStatus)).length,
          completed: tasks.filter(item => item.salesmanStatus === 'FINISHED').length
        },
        income: {
          estimated: money(tasks.filter(item => item.salesmanStatus !== 'FINISHED'), ['expectedCommission', 'expectedIncome']),
          completed: money(tasks.filter(item => item.salesmanStatus === 'FINISHED'), ['commissionAmount', 'completedCommission'])
        },
        branchName: branch && branch.name ? branch.name : '暂未绑定网点',
        tasks: tasks.slice(0, 4), pendingTransfers: transfers || [],
        transferApiUnavailable: transfers === null, loading: false
      })
    }).catch(error => this.setData({ loading: false, message: error.message }))
  },
  decideTransfer(event) {
    if (this.data.operatingTransferId) return
    const { transferId, decision } = event.detail
    this.setData({ operatingTransferId: String(transferId), message: '' })
    decideTransfer(transferId, decision).then(() => {
      wx.showToast({ title: decision === 'accept' ? '已接受转接' : '已拒绝转接', icon: 'success' })
      this.setData({ operatingTransferId: '' })
      this.refresh()
    }).catch(error => this.setData({ operatingTransferId: '', message: error.message }))
  },
  goTasks() { wx.navigateTo({ url: '/modules/salesman/pages/tasks/index' }) },
  goGrabOrders() { wx.navigateTo({ url: '/modules/salesman/pages/grab-orders/index' }) },
  goBranch() { wx.navigateTo({ url: '/modules/salesman/pages/branch/index' }) }
})
