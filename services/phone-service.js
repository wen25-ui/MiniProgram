const { normalizePhone, validateMainlandMobile } = require('../domain/identity/phone')
const { getSession } = require('../core/auth/session')
const { request } = require('./api-client')

function queryPhoneAttribution(phone) {
  const normalizedPhone = normalizePhone(phone)
  if (!validateMainlandMobile(normalizedPhone)) {
    return Promise.reject(new Error('请输入正确的手机号'))
  }

  const session = getSession()
  if (!session || !session.token) return Promise.reject(new Error('请先登录'))
  return request(`/v1/phone-attribution?phone=${encodeURIComponent(normalizedPhone)}&_=${Date.now()}`, { session })
}

module.exports = {
  queryPhoneAttribution
}
