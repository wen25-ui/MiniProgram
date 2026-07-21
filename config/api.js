// 由 server/start-local.ps1 在本机调试时自动更新。
// 真机必须与此地址处于同一局域网；生产环境必须改为已备案的 HTTPS 域名。
const lanHost = '192.168.1.18'

module.exports = {
  baseUrl: 'http://192.168.1.18:3000'
}