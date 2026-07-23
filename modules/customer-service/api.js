const { getSession } = require('../../core/auth/session')
const { request } = require('../../services/api-client')

function apiRequest(path, method = 'GET', data) {
  const session = getSession()
  if (!session || !session.token) return Promise.reject(new Error('请先登录'))
  return request(path, { method, data, session })
}

function getReviews(status = 'ALL') {
  return apiRequest(`/v1/customer-service/reviews?status=${encodeURIComponent(status)}`)
    .then(response => response.reviews || [])
}

function getFollowUps(status = 'ALL') {
  return apiRequest(`/v1/customer-service/follow-ups?status=${encodeURIComponent(status)}`)
    .then(response => response.followUps || [])
}

function getReviewQuestions() {
  return apiRequest('/v1/customer-service/review/questions')
    .then(response => response.questions || [])
}

function saveReviewAnswer(orderId, questionId, answer) {
  return apiRequest('/v1/customer-service/review/answers', 'POST', { orderId, questionId, answer })
}

function getApplication(orderId) {
  return apiRequest(`/v1/customer/applications/${orderId}`).then(response => response.application)
}

function startContact(orderId) {
  return apiRequest(`/v1/customer/applications/${orderId}/start-contact`, 'POST', {})
}

function saveContactResult(orderId, result, reason = '') {
  return apiRequest(`/v1/customer/applications/${orderId}/contact-result`, 'POST', { result, reason })
}

function getCustomerTags(customerId) {
  return apiRequest(`/v1/customer-service/customers/${customerId}/tags`)
    .then(response => response.tags || [])
}

function addCustomerTag(customerId, tag) {
  return apiRequest(`/v1/customer-service/customers/${customerId}/tags`, 'POST', { tag })
}

function deleteCustomerTag(customerId, tagId) {
  return apiRequest(`/v1/customer-service/customers/${customerId}/tags/${tagId}`, 'DELETE')
}

function getCustomerNotes(customerId) {
  return apiRequest(`/v1/customer-service/customers/${customerId}/notes`)
    .then(response => response.notes || [])
}

function addCustomerNote(customerId, content) {
  return apiRequest(`/v1/customer-service/customers/${customerId}/notes`, 'POST', { content })
}

function getBranchCandidates(orderId) {
  return apiRequest(`/v1/customer/applications/${orderId}/dispatch-candidates`)
    .then(response => response.outlets || { candidates: [], matchLevel: '' })
}

function assignBranch(orderId, branchId) {
  return apiRequest(`/v1/customer-service/orders/${orderId}/assign-branch`, 'POST', { branchId })
}

function getFollowUpDetail(orderId) {
  return apiRequest(`/v1/customer/work-items/${orderId}`).then(response => response.application)
}

module.exports = {
  getReviews,
  getFollowUps,
  getReviewQuestions,
  saveReviewAnswer,
  getApplication,
  startContact,
  saveContactResult,
  getCustomerTags,
  addCustomerTag,
  deleteCustomerTag,
  getCustomerNotes,
  addCustomerNote,
  getBranchCandidates,
  assignBranch,
  getFollowUpDetail
}
