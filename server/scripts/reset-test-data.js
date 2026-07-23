const db = require('../src/db')
const config = require('../src/config')
const {
  RESET_TABLES, assertSafe, existingTables, parseArgs, printPlan, tableCounts
} = require('./test-data-common')

async function main() {
  const args = parseArgs()
  assertSafe(config, args)
  const existing = await existingTables(db, config.db.database)
  const tables = RESET_TABLES.filter(table => existing.has(table))
  const counts = await tableCounts(db, tables)
  printPlan(config, tables, counts)
  if (!args.execute) {
    console.log('DRY-RUN：未修改数据库。')
    return
  }

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    for (const table of tables) await connection.query(`DELETE FROM \`${table}\``)
    await connection.commit()
    const remaining = await tableCounts(connection, tables)
    const nonEmpty = Object.entries(remaining).filter(([, count]) => count !== 0)
    if (nonEmpty.length) throw new Error(`清理后仍有记录: ${JSON.stringify(nonEmpty)}`)
    console.log('清理完成:', tables)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  }).finally(() => db.end())
}

module.exports = { main }
