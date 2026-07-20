// 真机局域网调试时填写运行 server/start-local.ps1 的电脑 IPv4；留空则使用开发者工具本机地址。
const lanHost = '192.168.1.18'

module.exports = {
  baseUrl: lanHost ? `http://${lanHost}:3000` : 'http://127.0.0.1:3000'
}
