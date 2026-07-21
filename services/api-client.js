const { baseUrl } = require('../config/api')
const { clearSession } = require('../core/auth/session')

let redirectingToLogin = false

function request(path, options = {}) {
  const session = options.session || {}
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: Object.assign({ 'content-type': 'application/json' }, session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(response.data)
        if (response.statusCode === 401 && session.token) {
          clearSession()
          if (!redirectingToLogin) {
            redirectingToLogin = true
            setTimeout(() => {
              wx.reLaunch({
                url: '/pages/auth/login/index',
                complete: () => { redirectingToLogin = false }
              })
            }, 0)
          }
          return reject(new Error('登录已过期，请重新登录'))
        }
        reject(new Error((response.data && response.data.error) || '服务请求失败'))
      },
      fail() { reject(new Error('无法连接业务服务，请检查 API 服务与域名配置')) }
    })
  })
}

module.exports = { request }
