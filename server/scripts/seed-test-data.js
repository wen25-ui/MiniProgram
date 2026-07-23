const db = require('../src/db')
const config = require('../src/config')
const {
  ACCOUNT_SPECS, assertSafe, existingTables, parseArgs, passwordHash, printPlan, tableCounts
} = require('./test-data-common')

const APPLICATION_STATUSES = [
  'PENDING', 'CONTACTING', 'VERIFYING', 'CONFIRMED', 'ASSIGNED',
  'PROCESSING', 'COMPLETED', 'COMPLETED', 'CONFIRMED', 'CONTACTING',
  'DISPATCHING', 'PENDING_VERIFICATION', 'COMPLETED', 'COMPLETED', 'INVALID_INFO'
]
const TASK_STATUSES = [
  'PENDING_ACCEPT', 'ACCEPTED', 'WAITING_CONTACT', 'CONTACT_FAILED', 'CONTACTED',
  'WAITING_TIME_CONFIRMATION', 'TIME_CONFIRMED', 'WAITING_HOME_SERVICE',
  'WAITING_CUSTOMER_ARRIVAL', 'WAITING_START_CONFIRMATION', 'PROCESSING',
  'WAITING_RESULT_UPLOAD', 'PENDING_VERIFICATION', 'COMPLETED'
]
const CS_STATUSES = [
  'ASSIGNED', 'ASSIGNED', 'PROCESSING', 'PROCESSING', 'WAIT_DISPATCH', 'TIMEOUT', 'COMPLETED',
  'ASSIGNED', 'ASSIGNED', 'PROCESSING', 'WAIT_DISPATCH', 'COMPLETED'
]

async function insertUser(connection, spec, hash) {
  const [result] = await connection.execute(
    `INSERT INTO users (phone, login_name, password_hash, display_name, account_status, phone_verified_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', NOW(3))`,
    [spec.phone || null, spec.loginName || null, hash, spec.displayName]
  )
  return result.insertId
}

async function main() {
  const args = parseArgs()
  assertSafe(config, args)
  const existing = await existingTables(db, config.db.database)
  const required = ['users', 'user_roles', 'merchants', 'sys_area', 'applications']
  const missing = required.filter(table => !existing.has(table))
  if (missing.length) throw new Error(`缺少必要数据表: ${missing.join(', ')}`)
  const planTables = ['users', 'merchants', 'applications'].filter(table => existing.has(table))
  printPlan(config, planTables, await tableCounts(db, planTables))
  if (!args.execute) {
    console.log('DRY-RUN：账号密码将从 SEED_TEST_PASSWORD 读取，未修改数据库。')
    return
  }

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [[existingSeed]] = await connection.execute(
      "SELECT id FROM users WHERE login_name = 'admin_test' LIMIT 1"
    )
    if (existingSeed) {
      const phones = ACCOUNT_SPECS.filter(spec => spec.phone).map(spec => spec.phone)
      const placeholders = phones.map(() => '?').join(',')
      const [[accountCount]] = await connection.execute(
        `SELECT COUNT(*) AS count FROM users
         WHERE login_name = 'admin_test' OR phone IN (${placeholders})`,
        phones
      )
      const [[applicationCount]] = await connection.execute(
        "SELECT COUNT(*) AS count FROM applications WHERE rule_version = 'test-data-v1'"
      )
      if (Number(accountCount.count) !== ACCOUNT_SPECS.length || Number(applicationCount.count) !== APPLICATION_STATUSES.length) {
        throw new Error('检测到不完整的标准测试数据；请使用 rebuild 安全重建')
      }
      await connection.commit()
      console.log('标准测试数据已完整存在；seed 保持幂等，未创建重复记录。')
      return
    }

    const [areas] = await connection.query(
      'SELECT id, name FROM sys_area WHERE level = 3 ORDER BY id LIMIT 2'
    )
    if (areas.length < 2) throw new Error('sys_area 至少需要两个真实区县，无法创建测试网点')

    const merchantIds = {}
    const branchIds = {}
    for (let i = 0; i < 2; i++) {
      const name = `测试网点${i ? 'B' : 'A'}`
      const [result] = await connection.execute(
        `INSERT INTO merchants
         (name, contact_name, contact_phone, service_region, area_id, status)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
        [name, `测试联系人${i ? 'B' : 'A'}`, `1369999000${i + 1}`, areas[i].name, areas[i].id]
      )
      merchantIds[name] = result.insertId
      const [branchResult] = await connection.execute(
        `INSERT INTO branches
          (merchant_id, name, address, contact_name, contact_phone, status)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
        [result.insertId, name, `${areas[i].name}测试路${i + 1}号`, `测试负责人${i ? 'B' : 'A'}`, `1369999000${i + 1}`]
      )
      branchIds[name] = branchResult.insertId
    }

    const hash = passwordHash(process.env.SEED_TEST_PASSWORD)
    const users = []
    for (let i = 0; i < ACCOUNT_SPECS.length; i++) {
      const spec = ACCOUNT_SPECS[i]
      const userId = await insertUser(connection, spec, hash)
      users.push({ ...spec, id: userId })
      const merchantId = spec.merchant ? merchantIds[spec.merchant] : null
      await connection.execute(
        `INSERT INTO user_roles
         (user_id, role_code, merchant_id, assigned_merchant_id, branch_id, salesman_code,
          salesman_type, can_field_service, service_region, area_id)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        [
          userId, spec.role, spec.role === 'merchant' ? merchantId : null,
          spec.role === 'salesman' ? merchantId : null,
          spec.role === 'salesman' ? branchIds[spec.merchant] : null,
          spec.role === 'salesman' ? `TEST-S${String(i + 1).padStart(3, '0')}` : null,
          spec.role === 'salesman' && spec.canFieldService ? 1 : 0,
          spec.role === 'salesman' ? (spec.merchant === '测试网点B' ? areas[1].name : areas[0].name) : null,
          spec.role === 'salesman' ? (spec.merchant === '测试网点B' ? areas[1].id : areas[0].id) : null
        ]
      )
    }

    const clients = users.filter(user => user.role === 'client')
    const salesmen = users.filter(user => user.role === 'salesman')
    const services = users.filter(user => user.role === 'customer-service')
    const finance = users.find(user => user.role === 'finance')
    for (let i = 0; i < APPLICATION_STATUSES.length; i++) {
      const id = `70000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
      const client = clients[i % clients.length]
      const status = APPLICATION_STATUSES[i]
      const store = i % 2 === 0
      const branchName = i % 3 === 0 ? '测试网点B' : '测试网点A'
      const branchId = branchIds[branchName]
      const merchantId = merchantIds[branchName]
      const eligibleSalesmen = salesmen.filter(item => item.merchant === branchName && (store || item.canFieldService))
      const assignedSalesman = status === 'ASSIGNED' || status === 'PROCESSING' || status === 'PENDING_VERIFICATION' || completed
        ? eligibleSalesmen[i % eligibleSalesmen.length] : null
      const completed = status === 'COMPLETED'
      await connection.execute(
        `INSERT INTO applications
         (id, client_user_id, phone_snapshot, attribution_status, local_option, expense_tier,
          commitments, pre_screen_passed, pre_screen_status, rule_version, status, service_mode,
          appointment_time, service_region, district_area_id, assigned_merchant_id, branch_id,
          current_salesman_id, assign_type, assigned_salesman_user_id,
          expected_refund_amount, refund_status, screening_submitted_at)
         VALUES (?, ?, ?, 'QUERY_SUCCESS', 'LOCAL_RESIDENT', 'FROM_250', JSON_ARRAY(true,true,true),
          1, 'PENDING', 'test-data-v1', ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY), ?, ?, ?, ?, ?, 'BRANCH_ASSIGN', ?, ?, ?, NOW(3))`,
        [
          id, client.id, client.phone, status, store ? 'STORE_SERVICE' : 'HOME_SERVICE',
          branchName === '测试网点B' ? areas[1].name : areas[0].name,
          branchName === '测试网点B' ? areas[1].id : areas[0].id,
          merchantId, branchId, assignedSalesman && assignedSalesman.id, assignedSalesman && assignedSalesman.id,
          completed ? 600 : null,
          i === 7 ? 'REFUND_POSTED' : (completed ? 'PENDING_CONFIRMATION' : 'NOT_RECORDED')
        ]
      )
      await connection.execute(
        `INSERT INTO application_status_history
         (application_id, to_status, action_code, operator_user_id, operator_role)
         VALUES (?, ?, 'TEST_DATA_SEEDED', ?, 'customer-service')`,
        [id, status, services[i % 2].id]
      )

      if (i < TASK_STATUSES.length) {
        const taskId = `71000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
        await connection.execute(
          `INSERT INTO application_tasks
           (id, application_id, service_type, assignee_user_id, store_id, branch_id, assign_type,
            customer_id, customer_name, customer_phone, status, appointment_time, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, 'BRANCH_ASSIGN', ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY), ?)`,
          [
            taskId, id, store ? 'STORE_SERVICE' : 'HOME_SERVICE',
            assignedSalesman ? assignedSalesman.id : null,
            merchantId, branchId, client.id, client.displayName, client.phone,
            TASK_STATUSES[i], TASK_STATUSES[i] === 'COMPLETED' ? new Date() : null
          ]
        )
        await connection.execute(
          `INSERT INTO application_task_status_history
           (task_id, old_status, new_status, operator_user_id, operator_role, operation)
           VALUES (?, NULL, ?, ?, 'system', 'TEST_DATA_SEEDED')`,
          [taskId, TASK_STATUSES[i], salesmen[i % salesmen.length].id]
        )
      }

      if (i < CS_STATUSES.length) {
        const csId = `72000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
        const csStatus = CS_STATUSES[i]
        const assignee = i < 7 ? services[0] : services[1]
        await connection.execute(
          `INSERT INTO customer_service_tasks
           (id, application_id, assignee_user_id, status, due_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            csId, id, assignee.id, csStatus,
            csStatus === 'TIMEOUT' ? new Date(Date.now() - 3600000) : new Date(Date.now() + 86400000),
            csStatus === 'COMPLETED' ? new Date() : null
          ]
        )
        await connection.execute(
          `INSERT INTO customer_service_task_events
           (task_id, from_status, to_status, action_code, operator_user_id)
           VALUES (?, NULL, ?, 'TEST_DATA_SEEDED', ?)`,
          [csId, csStatus, assignee.id]
        )
      }
    }

    for (let i = 0; i < 3; i++) {
      const appId = `70000000-0000-4000-8000-${String(7 + i).padStart(12, '0')}`
      await connection.execute(
        `INSERT INTO paper_bills
         (application_id, bill_number, bill_date, merchant_id, cashback_amount,
          commission_rate, commission_amount, status, recorded_by_user_id, confirmed_by_user_id, confirmed_at, note)
         VALUES (?, ?, CURRENT_DATE, ?, ?, 0.100000, ?, ?, ?, ?, ?, '标准测试账单，不触发真实支付')`,
        [
          appId, `TEST-BILL-${i + 1}`, merchantIds[i % 2 ? '测试网点B' : '测试网点A'],
          500 + i * 100, 50 + i * 10,
          ['RECORDED', 'PENDING_CONFIRMATION', 'REFUND_POSTED'][i],
          finance.id, i === 2 ? finance.id : null, i === 2 ? new Date() : null
        ]
      )
    }

    await connection.commit()
    console.log('测试数据创建并校验成功。各角色账号数:')
    const [roleCounts] = await connection.query(
      'SELECT role_code, COUNT(*) AS count FROM user_roles GROUP BY role_code ORDER BY role_code'
    )
    console.table(roleCounts)
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

module.exports = { APPLICATION_STATUSES, CS_STATUSES, TASK_STATUSES, main }
