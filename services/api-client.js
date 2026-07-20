const { baseUrl } = require('../config/api')

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
        reject(new Error((response.data && response.data.error) || '服务请求失败'))
      },
      fail() { reject(new Error('无法连接业务服务，请检查 API 服务与域名配置')) }
    })
  })
}

module.exports = { request }
