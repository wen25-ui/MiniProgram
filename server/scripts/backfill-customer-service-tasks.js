const {
  ensureCustomerServiceTask,
  synchronizeCustomerServiceTask
} = require('../src/customer-service-task-service')

const ELIGIBLE_STATUSES = [
  'PENDING',
  'CONTACTING',
  'VERIFYING',
  'VERIFIED',
  'INVALID_INFO',
  'CORRECTING',
  'CONFIRMED',
  'DISPATCHING'
]

async function backfillCustomerServiceTasks(executor, logger = console) {
  if (!executor) throw new Error('Database executor is required')
  const [applications] = await executor.execute(
    `SELECT id, status
       FROM applications
      WHERE status IN (${ELIGIBLE_STATUSES.map(() => '?').join(',')})
      ORDER BY created_at, id`,
    ELIGIBLE_STATUSES
  )
  const totals = {
    scanned: applications.length,
    existing: 0,
    created: 0,
    noAssignee: 0,
    failed: 0
  }

  for (const application of applications) {
    const connection = await executor.getConnection()
    try {
      await connection.beginTransaction()
      const result = await ensureCustomerServiceTask(application.id, connection, { logger })
      if (result.reason === 'NO_ASSIGNEE') {
        totals.noAssignee += 1
      } else if (result.created) {
        totals.created += 1
        await synchronizeCustomerServiceTask(application.id, application.status, connection)
      } else {
        totals.existing += 1
        await synchronizeCustomerServiceTask(application.id, application.status, connection)
      }
      await connection.commit()
    } catch (cause) {
      await connection.rollback()
      totals.failed += 1
      logger.error(`Backfill failed for application ${application.id}: ${cause.message}`)
    } finally {
      connection.release()
    }
  }
  return totals
}

async function run() {
  const db = require('../src/db')
  try {
    const totals = await backfillCustomerServiceTasks(db)
    console.log(`Scanned: ${totals.scanned}`)
    console.log(`Existing: ${totals.existing}`)
    console.log(`Created: ${totals.created}`)
    console.log(`No assignee: ${totals.noAssignee}`)
    console.log(`Failed: ${totals.failed}`)
    if (totals.failed) process.exitCode = 1
  } finally {
    await db.end()
  }
}

if (require.main === module) {
  run().catch(async cause => {
    console.error(cause)
    process.exitCode = 1
  })
}

module.exports = { ELIGIBLE_STATUSES, backfillCustomerServiceTasks }
