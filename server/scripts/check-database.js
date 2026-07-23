const mysql = require('mysql2/promise')

const databaseConfig = {
  host: process.env.DB_HOST || 'mysql6.sqlpub.com',
  port: Number(process.env.DB_PORT || 3311),
  database: process.env.DB_NAME || 'wx_xcxkf',
  user: process.env.DB_USER || 'gongbw',
  password: process.env.DB_PASSWORD || 'szeyQss5AIaYPfdx',
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 15000),
  charset: 'utf8mb4'
}

async function checkDatabase() {
  const connection = await mysql.createConnection(databaseConfig)

  try {
    await connection.query('SET SESSION TRANSACTION READ ONLY')
    await connection.query('START TRANSACTION READ ONLY')

    const [[info]] = await connection.query(
      'SELECT DATABASE() AS databaseName, VERSION() AS databaseVersion, CURRENT_USER() AS currentUser'
    )
    const [tables] = await connection.query('SHOW TABLES')

    console.log('Database connection succeeded.')
    console.log(`Host: ${databaseConfig.host}:${databaseConfig.port}`)
    console.log(`Database: ${info.databaseName}`)
    console.log(`Version: ${info.databaseVersion}`)
    console.log(`Current user: ${info.currentUser}`)
    console.log(`Table count: ${tables.length}`)

    await connection.rollback()
  } finally {
    await connection.end()
  }
}

checkDatabase().catch(error => {
  console.error('Database smoke test failed.')
  console.error(error.message)
  process.exitCode = 1
})
