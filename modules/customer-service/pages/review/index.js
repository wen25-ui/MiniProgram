const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const {
  getCustomerServiceApplications, reviewApplication, recordContactResult, retryContact,
  selectServiceMode, confirmAppointment, dispatchApplication, startStoreService,
  submitStoreFulfillment, failStoreService, verifyFulfillment
} = require('../../../../services/client-application-service')
const { getAvailableSalesmen } = require('../../../../services/salesman-directory-service')

const EXPENSE = { UNDER_79: '低于79元', FROM_79: '79元以上', FROM_150: '150元以上', FROM_250: '250元以上', FROM_400: '400元以上' }

Page({
  data: {
    applications: [], filtered: [], filter: 'all', salesmen: [], rejectReasons: {},
    contactReasons: {}, appointmentTimes: {}, storeRemarks: {}, failureReasons: {},
    verificationReasons: {}, message: '', loading: true
  },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.refresh()
  },
  refresh() {
    getCustomerServiceApplications().then(applications => {
      const decorated = applications.map(item => Object.assign({}, item, {
        localNumberText: item.localNumber === true ? '是' : item.localNumber === false ? '否' : '未填写',
        expenseText: EXPENSE[item.expenseTier] || '未填写'
      }))
      this.setData({ applications: decorated, salesmen: getAvailableSalesmen(), loading: false, message: '' })
      this.applyFilter(this.data.filter)
    }).catch(error => this.setData({ loading: false, message: error.message }))
  },
  applyFilter(filter) {
    const groups = {
      review: ['PENDING_REVIEW'],
      contact: ['PENDING_CONTACT', 'CONTACT_FAILED', 'PENDING_SERVICE_MODE'],
      appointment: ['PENDING_APPOINTMENT', 'PENDING_DISPATCH'],
      store: ['PENDING_STORE_SERVICE', 'IN_STORE_SERVICE'],
      verify: ['PENDING_VERIFICATION', 'VERIFICATION_RETURNED']
    }
    this.setData({ filter, filtered: filter === 'all' ? this.data.applications : this.data.applications.filter(item => (groups[filter] || []).includes(item.status)) })
  },
  chooseFilter(event) { this.applyFilter(event.currentTarget.dataset.filter) },
  onFieldInput(event) { this.setData({ [`${event.currentTarget.dataset.field}.${event.currentTarget.dataset.id}`]: event.detail.value }) },
  onDispatchChange(event) {
    const salesman = this.data.salesmen[Number(event.detail.value)]
    dispatchApplication(event.currentTarget.dataset.id, salesman && salesman.id).then(() => this.refresh()).catch(error => this.setData({ message: error.message }))
  },
  operate(event) {
    const { id, action } = event.currentTarget.dataset
    let task
    if (action === 'approve') task = reviewApplication(id, 'APPROVE', '')
    if (action === 'reject') task = reviewApplication(id, 'REJECT', this.data.rejectReasons[id])
    if (action === 'contacted') task = recordContactResult(id, 'CONTACTED', '')
    if (action === 'unreachable') task = recordContactResult(id, 'UNREACHABLE', this.data.contactReasons[id])
    if (action === 'declined') task = recordContactResult(id, 'CLIENT_DECLINED', this.data.contactReasons[id])
    if (action === 'retry-contact') task = retryContact(id)
    if (action === 'home-service') task = selectServiceMode(id, 'HOME_SERVICE')
    if (action === 'store-service') task = selectServiceMode(id, 'STORE_SERVICE')
    if (action === 'confirm-appointment') task = confirmAppointment(id, this.data.appointmentTimes[id])
    if (action === 'start-store') task = startStoreService(id)
    if (action === 'submit-store') task = submitStoreFulfillment(id, this.data.storeRemarks[id])
    if (action === 'fail-store') task = failStoreService(id, this.data.failureReasons[id])
    if (action === 'verify-approve') task = verifyFulfillment(id, 'APPROVE', '')
    if (action === 'verify-return') task = verifyFulfillment(id, 'RETURN', this.data.verificationReasons[id])
    if (task) task.then(() => this.refresh()).catch(error => this.setData({ message: error.message }))
  }
})
