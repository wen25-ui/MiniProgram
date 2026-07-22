const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const {
  getCustomerWorkItems, getCustomerSalesmen, getCustomerOutlets,
  dispatchApplication, assignStoreApplication
} = require('../../../../services/client-application-service')

Page({
  data: {
    applications: [], filtered: [], filter: 'pending', dispatchType: 'all', dispatchTypeIndex: 0,
    dispatchTypeOptions: [{ label: '全部派遣类型', type: 'all' }, { label: '上门办理', type: 'HOME_SERVICE' }, { label: '指定网点办理', type: 'STORE_SERVICE' }],
    salesmen: [], homeSalesmen: [], branchSalesmen: [], outlets: [],
    message: '', loading: true, operating: false
  },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true, message: '' })
    Promise.all([getCustomerWorkItems(), getCustomerSalesmen(), getCustomerOutlets()]).then(([applications, salesmen, outlets]) => {
      this.setData({
        applications, salesmen, outlets,
        homeSalesmen: salesmen.filter(item => item.salesmanType === 'HOME_VISIT'),
        branchSalesmen: salesmen.filter(item => item.salesmanType === 'BRANCH'),
        loading: false, operating: false
      })
      this.applyFilter(this.data.filter)
    }).catch(error => this.setData({ loading: false, operating: false, message: error.message }))
  },
  applyFilter(filter) {
    const groups = {
      pending: ['CONFIRMED', 'DISPATCHING'],
      dispatched: ['ASSIGNED', 'PROCESSING', 'VERIFICATION_RETURNED'],
      completed: ['COMPLETED', 'SERVICE_FAILED', 'CANCELLED', 'CLOSED']
    }
    let filtered = this.data.applications.filter(item => (groups[filter] || []).includes(item.status))
    if (filter === 'dispatched' && this.data.dispatchType !== 'all') filtered = filtered.filter(item => item.serviceMode === this.data.dispatchType)
    this.setData({ filter, filtered })
  },
  chooseFilter(event) { this.applyFilter(event.currentTarget.dataset.filter) },
  onDispatchTypeChange(event) {
    const dispatchTypeIndex = Number(event.detail.value)
    const selected = this.data.dispatchTypeOptions[dispatchTypeIndex]
    this.setData({ dispatchTypeIndex, dispatchType: selected.type }, () => this.applyFilter('dispatched'))
  },
  onDispatchChange(event) {
    if (this.data.operating) return
    const applicationId = event.currentTarget.dataset.id
    const salesman = this.data.homeSalesmen[Number(event.detail.value)]
    if (!salesman) return wx.showToast({ title: '请选择有效的业务员', icon: 'none' })
    wx.showModal({
      title: '确认派遣任务？', content: `将该任务派遣给 ${salesman.name}`,
      success: result => { if (result.confirm) this.run(dispatchApplication(applicationId, salesman.id)) }
    })
  },
  onOutletChange(event) {
    if (this.data.operating) return
    const applicationId = event.currentTarget.dataset.id
    const outlet = this.data.outlets[Number(event.detail.value)]
    if (!outlet) return wx.showToast({ title: '请选择有效的网点', icon: 'none' })
    wx.showModal({
      title: '确认派遣到指定网点？', content: `将该任务派遣到 ${outlet.name}`,
      success: result => { if (result.confirm) this.run(assignStoreApplication(applicationId, outlet.id)) }
    })
  },
  run(task) {
    if (this.data.operating) return
    this.setData({ operating: true, message: '' })
    task.then(() => this.refresh()).catch(error => this.setData({ operating: false, message: error.message }))
  }
})
