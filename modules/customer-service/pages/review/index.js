const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getCustomerServiceTasks } = require('../../api')
const { TASK_FILTERS, taskStatusText } = require('../../task-model')

Page({
  data: { tasks: [], status: 'ALL', filters: TASK_FILTERS, loading: true, tasksUnavailable: false, message: '' },
  onLoad(options) {
    if (TASK_FILTERS.some(item => item.key === options.status)) this.setData({ status: options.status })
  },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) {
      return wx.reLaunch({ url: '/pages/auth/login/index' })
    }
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, tasksUnavailable: false, message: '' })
    getCustomerServiceTasks(this.data.status).then(rows => {
      const tasks = rows.map(item => ({
        id: item.id,
        orderId: item.orderId || (item.order && item.order.id),
        customerId: item.customerId || (item.customer && item.customer.id),
        customerName: item.customerName || (item.customer && item.customer.name) || '未填写',
        maskedPhone: item.maskedPhone || (item.customer && item.customer.maskedPhone) || '',
        projectName: item.projectName || (item.order && item.order.projectName) || '业务返现办理',
        status: item.status,
        statusText: taskStatusText(item.status),
        orderStatus: item.orderStatus || (item.order && item.order.status) || '',
        assignee: item.assignee || item.assigneeName || '',
        assignedAt: item.assignedAt || '',
        duration: item.duration || '',
        updatedAt: item.updatedAt || item.assignedAt || ''
      }))
      this.setData({ tasks, loading: false })
    }).catch(() => this.setData({ tasks: [], loading: false, tasksUnavailable: true }))
  },
  chooseFilter(event) {
    const status = event.currentTarget.dataset.status
    if (status === this.data.status) return
    this.setData({ status }, () => this.refresh())
  },
  openDetail(event) {
    const item = this.data.tasks[Number(event.currentTarget.dataset.index)]
    if (!item || !item.orderId) return wx.showToast({ title: '任务缺少关联订单', icon: 'none' })
    const query = [
      `id=${encodeURIComponent(item.orderId)}`,
      `taskId=${encodeURIComponent(item.id || '')}`,
      `customerId=${encodeURIComponent(item.customerId || '')}`,
      `customerName=${encodeURIComponent(item.customerName || '')}`,
      `projectName=${encodeURIComponent(item.projectName || '')}`
    ].join('&')
    wx.navigateTo({ url: `/modules/customer-service/pages/review-detail/index?${query}` })
  }
})
