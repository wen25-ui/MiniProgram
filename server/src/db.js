const mysql = require(process.env.MYSQL2_MODULE_PATH || 'mysql2/promise')
const config = require('./config')

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z'
})

module.exports = pool
