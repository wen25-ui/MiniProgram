const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const {
  getCustomerWorkItems, getRegionalDispatchCandidates,
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
    getCustomerWorkItems().then(applications => Promise.all(applications.map(application => {
      if (!['CONFIRMED', 'DISPATCHING'].includes(application.status) || !application.districtAreaId) return Promise.resolve(Object.assign({}, application, { eligibleSalesmen: [], eligibleOutlets: [] }))
      return getRegionalDispatchCandidates(application.id).then(result => {
        const eligibleSalesmen = (result.salesmen.candidates || []).map(salesman => Object.assign({}, salesman, {
          dispatchLabel: `${salesman.name}（${salesman.serviceRegion || '区域未设置'} · 进行中 ${salesman.activeTaskCount || 0} 单）`
        }))
        const eligibleOutlets = (result.outlets.candidates || []).map(outlet => Object.assign({}, outlet, {
          outletLabel: `${outlet.name}（${outlet.serviceRegion || '区域未设置'}）`
        }))
        return Object.assign({}, application, {
          eligibleSalesmen, eligibleOutlets,
          salesmanMatchLevel: result.salesmen.matchLevel, outletMatchLevel: result.outlets.matchLevel,
          salesmanNearbyFallback: result.salesmen.matchLevel !== 'SAME_DISTRICT',
          outletNearbyFallback: result.outlets.matchLevel !== 'SAME_DISTRICT'
        })
      })
    }))).then(applicationsWithRegion => {
      this.setData({
        applications: applicationsWithRegion,
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
    const application = this.data.applications.find(item => item.id === applicationId)
    const salesman = application && application.eligibleSalesmen[Number(event.detail.value)]
    if (!salesman) return wx.showToast({ title: '请选择有效的业务员', icon: 'none' })
    wx.showModal({
      title: '确认派遣任务？', content: `将该任务派遣给 ${salesman.name}`,
      success: result => { if (result.confirm) this.run(dispatchApplication(applicationId, salesman.id)) }
    })
  },
  onOutletChange(event) {
    if (this.data.operating) return
    const applicationId = event.currentTarget.dataset.id
    const application = this.data.applications.find(item => item.id === applicationId)
    const outlet = application && application.eligibleOutlets[Number(event.detail.value)]
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
