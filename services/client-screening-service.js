const { getSession } = require('../core/auth/session')
const { request } = require('./api-client')

function submitClientScreening(application) {
  const session = getSession()
  if (!session || !session.token) return Promise.reject(new Error('请先完成手机号认证'))
  return request('/v1/applications/pre-screen', {
    method: 'POST',
    session,
    data: application
  }).then(result => Object.assign({}, application, result, { submittedAt: new Date().toISOString() }))
}

module.exports = {
  submitClientScreening
}
