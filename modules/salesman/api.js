const { getSession } = require('../../core/auth/session')
const { request } = require('../../services/api-client')

function apiRequest(path, method = 'GET', data) {
  const session = getSession()
  if (!session || !session.token) return Promise.reject(new Error('请先登录'))
  return request(path, { method, data, session })
}

function getTasks(category = 'mine') {
  return apiRequest(`/v1/salesman/tasks?category=${encodeURIComponent(category)}`).then(response => response.tasks || [])
}

function getTask(taskId) {
  return apiRequest(`/v1/salesman/tasks/${taskId}`).then(response => response.task)
}

function getBranch() {
  return apiRequest('/v1/salesman/branch').then(response => response.branch)
}

function getBranchPendingOrders() {
  return apiRequest('/v1/salesman/grab-orders').then(response => response.orders || [])
}

function grabOrder(orderId) {
  return apiRequest(`/v1/salesman/orders/${orderId}/grab`, 'POST', {})
}

function transferOrder(orderId, toSalesmanId, reason) {
  return apiRequest(`/v1/salesman/orders/${orderId}/transfer`, 'POST', { toSalesmanId, reason })
}

function getPendingTransfers() {
  return apiRequest('/v1/salesman/transfers?status=PENDING').then(response => response.transfers || [])
}

function decideTransfer(transferId, decision) {
  return apiRequest(`/v1/salesman/transfers/${transferId}/${decision}`, 'POST', {})
}

function getSchedule() {
  return apiRequest('/v1/salesman/schedule').then(response => response.schedules || response.tasks || [])
}

function acceptTask(taskId) { return apiRequest(`/v1/salesman/tasks/${taskId}/accept`, 'POST', {}) }
function recordContact(taskId, data) { return apiRequest(`/v1/salesman/tasks/${taskId}/contact`, 'POST', data) }
function confirmAppointment(taskId, appointmentTime, serviceAddress) { return apiRequest(`/v1/salesman/tasks/${taskId}/appointment`, 'POST', { appointmentTime, serviceAddress }) }
function confirmArrival(taskId) { return apiRequest(`/v1/salesman/tasks/${taskId}/arrive`, 'POST', {}) }
function startTask(taskId) { return apiRequest(`/v1/salesman/tasks/${taskId}/start`, 'POST', {}) }
function finishProcessing(taskId, remark) { return apiRequest(`/v1/salesman/tasks/${taskId}/finish-processing`, 'POST', { remark }) }
function uploadResult(taskId, identityVerified, resultDescription) {
  return apiRequest(`/v1/salesman/tasks/${taskId}/result`, 'POST', { identityVerified, resultStatus: 'SUCCESS', resultDescription })
}
function abnormalClose(taskId, reason) { return apiRequest(`/v1/salesman/tasks/${taskId}/abnormal-close`, 'POST', { reason }) }

module.exports = {
  getTasks,
  getTask,
  getBranch,
  getBranchPendingOrders,
  grabOrder,
  transferOrder,
  getPendingTransfers,
  decideTransfer,
  getSchedule,
  acceptTask,
  recordContact,
  confirmAppointment,
  confirmArrival,
  startTask,
  finishProcessing,
  uploadResult,
  abnormalClose
}
