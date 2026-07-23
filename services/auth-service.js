const { saveSession } = require('../core/auth/session')
const { request } = require('./api-client')

function saveAuthenticatedSession(response) {
  return saveSession({
    phone: response.user.phone,
    roles: response.user.roles,
    defaultRole: response.user.defaultRole,
    userId: response.user.id,
    token: response.token,
    salesmanId: response.user.salesmanId,
    branchId: response.user.branchId,
    branchName: response.user.branchName,
    canFieldService: response.user.canFieldService,
    // Legacy response compatibility only.
    salesmanType: response.user.salesmanType,
    authenticatedAt: new Date().toISOString()
  })
}

function login(account, password) {
  if (!account || !password) return Promise.reject(new Error('请输入账号和密码'))
  return request('/v1/auth/login', {
    method: 'POST',
    data: { account, password }
  }).then(saveAuthenticatedSession)
}

function registerClient(phone, password) {
  return request('/v1/auth/register', {
    method: 'POST',
    data: { phone, password }
  }).then(saveAuthenticatedSession)
}

module.exports = {
  login,
  registerClient
}
