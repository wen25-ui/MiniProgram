const mysql = require(process.env.MYSQL2_MODULE_PATH || 'mysql2/promise')
const config = require('./config')

const missingPhoneDbConfig = !config.phoneDb.host ||
  !config.phoneDb.database ||
  !config.phoneDb.user ||
  !config.phoneDb.password

function phoneDbConfigurationError() {
  return new Error(
    '缺少号码归属地数据库环境变量 PHONE_DB_HOST、PHONE_DB_NAME、PHONE_DB_USER 或 PHONE_DB_PASSWORD'
  )
}

if (missingPhoneDbConfig) {
  // 号码归属地数据库是可选服务。没有配置时仍允许主 API、登录和业务数据库健康检查启动；
  // 只有真正调用号码归属地功能时才返回明确错误。
  module.exports = {
    async execute() {
      throw phoneDbConfigurationError()
    },
    async query() {
      throw phoneDbConfigurationError()
    },
    async getConnection() {
      throw phoneDbConfigurationError()
    }
  }
} else {
  module.exports = mysql.createPool({
    ...config.phoneDb,
    waitForConnections: true,
    connectionLimit: 5,
    timezone: 'Z'
  })
}
