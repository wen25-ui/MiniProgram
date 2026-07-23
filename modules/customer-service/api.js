const { getSession } = require('../../core/auth/session')
const { request } = require('../../services/api-client')

// TODO: 后端完成客服任务模型后开启 customerTasks。
// TODO: 数据库应用网点组织 migration，并确认 follow-ups 查询可用后开启 followUps。
const BACKEND_CAPABILITIES = {
  customerTasks: false,
  followUps: false
}

function unavailable(message) {
  const error = new Error(message)
  error.code = 'BACKEND_CAPABILITY_UNAVAILABLE'
  return Promise.reject(error)
}

function apiRequest(path, method = 'GET', data) {
  const session = getSession()
  if (!session || !session.token) return Promise.reject(new Error('请先登录'))
  return request(path, { method, data, session })
}

function getReviews(status = 'ALL') {
  return apiRequest(`/v1/customer-service/reviews?status=${encodeURIComponent(status)}`)
    .then(response => response.reviews || [])
}

function getTaskStatistics() {
  if (!BACKEND_CAPABILITIES.customerTasks) return unavailable('客服任务统计接口待接入')
  return apiRequest('/v1/customer-service/tasks/statistics').then(response => response.statistics || response)
}

function getCustomerServiceTasks(status = 'ALL') {
  if (!BACKEND_CAPABILITIES.customerTasks) return unavailable('客服个人任务接口待接入')
  return apiRequest(`/v1/customer-service/tasks?status=${encodeURIComponent(status)}`)
    .then(response => response.tasks || [])
}

function getCustomerServiceTask(taskId) {
  if (!BACKEND_CAPABILITIES.customerTasks) return unavailable('客服任务详情接口待接入')
  return apiRequest(`/v1/customer-service/tasks/${taskId}`).then(response => response.task)
}

function getFollowUps(status = 'ALL') {
  if (!BACKEND_CAPABILITIES.followUps) return unavailable('项目跟进接口等待网点数据迁移完成')
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
  getTaskStatistics,
  getCustomerServiceTasks,
  getCustomerServiceTask,
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
