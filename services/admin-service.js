const { getSession } = require('../core/auth/session')
const { request } = require('./api-client')

function accountsPath(role, id) {
  return id ? `/v1/admin/accounts/${role}/${id}` : `/v1/admin/accounts?role=${role}`
}

function listAccounts(role) {
  return request(accountsPath(role), { session: getSession() }).then(data => data.accounts || [])
}

function createAccount(role, data) {
  return request(accountsPath(role), { method: 'POST', session: getSession(), data })
}

function updateAccount(role, id, data) {
  return request(accountsPath(role, id), { method: 'PUT', session: getSession(), data })
}

function deleteAccount(role, id) {
  return request(accountsPath(role, id), { method: 'DELETE', session: getSession(), data: {} })
}

function listOrders(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return request(`/v1/admin/orders${query}`, { session: getSession() }).then(data => data.orders || [])
}

function getOrder(id) {
  return request(`/v1/admin/orders/${id}`, { session: getSession() }).then(data => data.order)
}

module.exports = { listAccounts, createAccount, updateAccount, deleteAccount, listOrders, getOrder }
