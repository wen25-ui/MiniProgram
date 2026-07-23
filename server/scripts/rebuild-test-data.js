const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const db = require('../src/db')
const config = require('../src/config')
const { assertSafe, parseArgs } = require('./test-data-common')

function backupFileName() {
  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return path.resolve(__dirname, '../../database/backups', `${config.db.database}_${timestamp}.sql`)
}

function backupDatabase(file) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const output = fs.createWriteStream(file, { flags: 'wx' })
    const child = spawn('mysqldump', [
      `--host=${config.db.host}`, `--port=${config.db.port}`, `--user=${config.db.user}`,
      '--single-transaction', '--routines', '--events', config.db.database
    ], { env: { ...process.env, MYSQL_PWD: config.db.password }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stdout.pipe(output)
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`mysqldump 失败(${code}): ${stderr.trim()}`)))
  })
}

async function main() {
  const args = parseArgs()
  assertSafe(config, args)
  if (!args.execute) {
    const { main: reset } = require('./reset-test-data')
    await reset()
    return
  }
  if (args.skipBackup) {
    console.warn('警告：已显式跳过备份；数据库修改不可自动恢复。')
  } else {
    const file = backupFileName()
    await backupDatabase(file)
    console.log(`备份完成: ${file}`)
  }
  const { main: reset } = require('./reset-test-data')
  await reset()
  const { main: seed } = require('./seed-test-data')
  await seed()
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  }).finally(() => db.end())
}

module.exports = { backupFileName, main }
