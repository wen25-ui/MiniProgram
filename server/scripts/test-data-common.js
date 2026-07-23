const crypto = require('crypto')

const CONFIRMATION = 'RESET_MINIPROGRAM_TEST_DATA'
const ACCOUNT_SPECS = [
  { loginName: 'admin_test', displayName: '测试管理员', role: 'admin' },
  { phone: '13400000001', displayName: '测试老板', role: 'boss' },
  { phone: '13500000001', displayName: '测试财务', role: 'finance' },
  { phone: '13700000001', displayName: '测试客服A', role: 'customer-service' },
  { phone: '13700000002', displayName: '测试客服B', role: 'customer-service' },
  { phone: '13600000001', displayName: '测试商家A', role: 'merchant', merchant: '测试网点A' },
  { phone: '13600000002', displayName: '测试商家B', role: 'merchant', merchant: '测试网点B' },
  { phone: '13800001111', displayName: '测试业务员A1', role: 'salesman', merchant: '测试网点A', canFieldService: true },
  { phone: '13800001112', displayName: '测试业务员A2', role: 'salesman', merchant: '测试网点A', canFieldService: true },
  { phone: '13800001113', displayName: '测试业务员A3', role: 'salesman', merchant: '测试网点A', canFieldService: false },
  { phone: '13800001201', displayName: '测试业务员B1', role: 'salesman', merchant: '测试网点B', canFieldService: true },
  { phone: '13800001202', displayName: '测试业务员B2', role: 'salesman', merchant: '测试网点B', canFieldService: false },
  { phone: '13800001203', displayName: '测试业务员B3', role: 'salesman', merchant: '测试网点B', canFieldService: false },
  ...Array.from({ length: 10 }, (_, i) => ({
    phone: `1391234567${i}`, displayName: `测试客户${i + 1}`, role: 'client'
  }))
]

const RESET_TABLES = [
  'fulfillment_voucher_attachments',
  'customer_service_task_events',
  'application_task_status_history',
  'application_contact_records',
  'fulfillment_submissions',
  'application_dispatches',
  'application_appointments',
  'application_reviews',
  'application_status_history',
  'paper_bills',
  'customer_service_tasks',
  'application_tasks',
  'order_assignments',
  'order_grab_records',
  'order_transfer_logs',
  'review_answers',
  'customer_internal_tags',
  'customer_internal_notes',
  'audit_logs',
  'applications',
  'auth_sessions',
  'client_entry_sources',
  'merchant_invites',
  'user_roles',
  'branches',
  'users',
  'merchants'
]

function parseArgs(argv = process.argv.slice(2)) {
  const valueAfter = flag => {
    const index = argv.indexOf(flag)
    return index < 0 ? null : argv[index + 1]
  }
  return {
    execute: argv.includes('--execute'),
    dryRun: argv.includes('--dry-run') || !argv.includes('--execute'),
    confirm: valueAfter('--confirm'),
    skipBackup: argv.includes('--skip-backup'),
    allowRemote: argv.includes('--allow-remote')
  }
}

function assertSafe(config, args, env = process.env) {
  if (!args.execute) return
  if (env.NODE_ENV === 'production') throw new Error('拒绝执行：NODE_ENV=production')
  const localHost = ['localhost', '127.0.0.1'].includes(config.db.host)
  const developmentName = /(dev|test|demo)/i.test(config.db.database)
  if ((!localHost || !developmentName) && !args.allowRemote) {
    throw new Error('拒绝执行：远程或非开发库必须显式提供 --allow-remote')
  }
  if (args.confirm !== CONFIRMATION) throw new Error(`拒绝执行：必须提供 --confirm ${CONFIRMATION}`)
  if (!env.SEED_TEST_PASSWORD) throw new Error('拒绝执行：缺少 SEED_TEST_PASSWORD')
}

function passwordHash(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex')
}

async function existingTables(db, database) {
  const [rows] = await db.execute(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
    [database]
  )
  return new Set(rows.map(row => row.TABLE_NAME))
}

async function tableCounts(db, tables) {
  const counts = {}
  for (const table of tables) {
    const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM \`${table}\``)
    counts[table] = Number(row.count)
  }
  return counts
}

function printPlan(config, tables, counts) {
  console.log(`数据库主机: ${config.db.host}`)
  console.log(`数据库端口: ${config.db.port}`)
  console.log(`数据库名称: ${config.db.database}`)
  console.log(`待清理表: ${tables.join(', ')}`)
  console.log('当前记录数:', counts)
  console.log(`预计创建测试账号: ${ACCOUNT_SPECS.length}`)
  console.log('预计创建客户申请: 15')
  console.log('预计创建客服任务: 12')
  console.log('预计创建办理任务: 14')
}

module.exports = {
  ACCOUNT_SPECS, CONFIRMATION, RESET_TABLES, assertSafe, existingTables,
  parseArgs, passwordHash, printPlan, tableCounts
}
