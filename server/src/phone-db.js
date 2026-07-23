const mysql = require(process.env.MYSQL2_MODULE_PATH || 'mysql2/promise')
const config = require('./config')

if (!config.phoneDb.host || !config.phoneDb.database || !config.phoneDb.user || !config.phoneDb.password) {
  throw new Error('缺少号码归属地数据库环境变量 PHONE_DB_HOST、PHONE_DB_NAME、PHONE_DB_USER 或 PHONE_DB_PASSWORD')
}

const pool = mysql.createPool({
  ...config.phoneDb,
  waitForConnections: true,
  connectionLimit: 5,
  timezone: 'Z'
})

module.exports = pool
