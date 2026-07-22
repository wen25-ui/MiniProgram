const { getSession } = require('../core/auth/session')
const { request } = require('./api-client')

function sessionFor(role) {
  const session = getSession()
  if (!session || !session.token) return Promise.reject(new Error('请先登录'))
  if (role && session.roles.indexOf(role) < 0) return Promise.reject(new Error('无权访问该资源'))
  return Promise.resolve(session)
}

function customerRequest(path, data) {
  return sessionFor('customer-service').then(session => request(path, { method: data ? 'POST' : 'GET', session, data }))
}

function salesmanRequest(path, data) {
  return sessionFor('salesman').then(session => request(path, { method: data ? 'POST' : 'GET', session, data }))
}

function getCustomerServiceApplications() {
  return customerRequest('/v1/customer/applications').then(response => response.applications || [])
}
function getCustomerServiceApplication(id) {
  return customerRequest(`/v1/customer/applications/${id}`).then(response => response.application)
}
function getCustomerWorkItems() {
  return customerRequest('/v1/customer/work-items').then(response => response.applications || [])
}
function getCustomerWorkItem(id) {
  return customerRequest(`/v1/customer/work-items/${id}`).then(response => response.application)
}
function getCustomerSalesmen() {
  return customerRequest('/v1/customer/salesmen').then(response => response.salesmen || [])
}
function getCustomerOutlets() {
  return customerRequest('/v1/customer/outlets').then(response => response.outlets || [])
}
function getCustomerVerifications(category) {
  const query = ['completed', 'rejected'].includes(category) ? `?category=${category}` : ''
  return customerRequest(`/v1/customer/verifications${query}`).then(response => response.verifications || [])
}
function getCustomerVerification(id) {
  return customerRequest(`/v1/customer/verifications/${id}`).then(response => response.verification)
}
function reviewApplication(id, decision, reason, serviceMode) { return customerRequest(`/v1/customer/applications/${id}/review`, { decision, reason, serviceMode }) }
function startCustomerContact(id) { return customerRequest(`/v1/customer/applications/${id}/start-contact`, {}) }
function recordContactResult(id, result, reason) { return customerRequest(`/v1/customer/applications/${id}/contact-result`, { result, reason }) }
function verifyCustomerInfo(id, verifyResult, remark) { return customerRequest(`/v1/customer/applications/${id}/verify-info`, { verifyResult, remark }) }
function recordCustomerIntention(id, customerIntention, remark) { return customerRequest(`/v1/customer/applications/${id}/intention`, { customerIntention, remark }) }
function correctCustomerInfo(id, correctedInfo, remark) { return customerRequest(`/v1/customer/applications/${id}/correct-info`, { correctedInfo, remark }) }
function selectServiceType(id, serviceMode) { return customerRequest(`/v1/customer/applications/${id}/service-type`, { serviceMode }) }
function retryContact(id) { return customerRequest(`/v1/customer/applications/${id}/retry-contact`, {}) }
function selectServiceMode(id, serviceMode) { return customerRequest(`/v1/customer/applications/${id}/service-mode`, { serviceMode }) }
function confirmAppointment(id, appointmentTime) { return customerRequest(`/v1/customer/applications/${id}/confirm-appointment`, { appointmentTime }) }
function dispatchApplication(id, salesmanId) { return customerRequest(`/v1/customer/applications/${id}/dispatch`, { salesmanId }) }
function assignStoreApplication(id, outletId) { return customerRequest(`/v1/customer/applications/${id}/assign-store`, { outletId }) }
function startStoreService(id) { return customerRequest(`/v1/customer/applications/${id}/start-store`, {}) }
function submitStoreFulfillment(id, voucherRemark) { return customerRequest(`/v1/customer/applications/${id}/submit-store`, { voucherRemark }) }
function failStoreService(id, reason) { return customerRequest(`/v1/customer/applications/${id}/service-fail`, { reason }) }
function verifyFulfillment(id, decision, reason, customerConfirmed) { return customerRequest(`/v1/customer/applications/${id}/verify`, { decision, reason, customerConfirmed }) }
function getSalesmanApplications() { return salesmanRequest('/v1/salesman/applications').then(response => response.applications || []) }
function startService(id) { return salesmanRequest(`/v1/salesman/applications/${id}/start`, {}) }
function submitFulfillment(id, identityVerified, voucherRemark) { return salesmanRequest(`/v1/salesman/applications/${id}/submit`, { identityVerified, voucherRemark }) }
function failHomeService(id, reason) { return salesmanRequest(`/v1/salesman/applications/${id}/fail`, { reason }) }

module.exports = {
  getCustomerServiceApplications,
  getCustomerServiceApplication,
  getCustomerWorkItems,
  getCustomerWorkItem,
  getCustomerSalesmen,
  getCustomerOutlets,
  getCustomerVerifications,
  getCustomerVerification,
  reviewApplication,
  startCustomerContact,
  recordContactResult,
  verifyCustomerInfo,
  recordCustomerIntention,
  correctCustomerInfo,
  selectServiceType,
  retryContact,
  selectServiceMode,
  confirmAppointment,
  dispatchApplication,
  assignStoreApplication,
  startStoreService,
  submitStoreFulfillment,
  failStoreService,
  verifyFulfillment,
  getSalesmanApplications,
  startService,
  submitFulfillment,
  failHomeService
}
