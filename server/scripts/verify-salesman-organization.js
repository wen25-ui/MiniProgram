const db = require('../src/db')
const config = require('../src/config')

const checks = {
  activeSalesmanWithoutActiveBranch: `
    SELECT COUNT(*) AS count
      FROM users u
      JOIN user_roles r ON r.user_id = u.id AND r.role_code = 'salesman'
      LEFT JOIN branches b ON b.id = r.branch_id AND b.status = 'ACTIVE'
     WHERE u.account_status = 'ACTIVE' AND b.id IS NULL`,
  invalidCapability: `
    SELECT COUNT(*) AS count
      FROM user_roles
     WHERE role_code = 'salesman' AND can_field_service NOT IN (0, 1)`,
  activeSalesmanOnDisabledBranch: `
    SELECT COUNT(*) AS count
      FROM users u
      JOIN user_roles r ON r.user_id = u.id AND r.role_code = 'salesman'
      JOIN branches b ON b.id = r.branch_id
     WHERE u.account_status = 'ACTIVE' AND b.status <> 'ACTIVE'`,
  legacyHomeWithoutFieldCapability: `
    SELECT COUNT(*) AS count
      FROM user_roles
     WHERE role_code = 'salesman'
       AND salesman_type = 'HOME_VISIT'
       AND can_field_service <> 1`,
  legacyBranchWithFieldCapability: `
    SELECT COUNT(*) AS count
      FROM user_roles
     WHERE role_code = 'salesman'
       AND salesman_type = 'BRANCH'
       AND can_field_service <> 0`,
  orphanTask: `
    SELECT COUNT(*) AS count
      FROM application_tasks t
      LEFT JOIN applications a ON a.id = t.application_id
     WHERE a.id IS NULL`,
  taskWithoutBranch: `
    SELECT COUNT(*) AS count
      FROM application_tasks
     WHERE branch_id IS NULL`,
  taskBranchMismatch: `
    SELECT COUNT(*) AS count
      FROM application_tasks t
      JOIN user_roles r ON r.user_id = t.assignee_user_id
                       AND r.role_code = 'salesman'
     WHERE t.assignee_user_id IS NOT NULL
       AND t.branch_id <> r.branch_id`,
  taskOwnerMismatch: `
    SELECT COUNT(*) AS count
      FROM application_tasks t
      JOIN applications a ON a.id = t.application_id
     WHERE NOT (t.assignee_user_id <=> a.current_salesman_id)`,
  duplicateSalesmanCode: `
    SELECT COUNT(*) AS count
      FROM (
        SELECT salesman_code
          FROM user_roles
         WHERE role_code = 'salesman' AND salesman_code IS NOT NULL
         GROUP BY salesman_code
        HAVING COUNT(*) > 1
      ) duplicates`
}

async function run() {
  console.log(`数据库主机: ${config.db.host}`)
  console.log(`数据库端口: ${config.db.port}`)
  console.log(`数据库名称: ${config.db.database}`)

  const [[summary]] = await db.query(`
    SELECT COUNT(*) AS active_salesmen,
           SUM(r.can_field_service = 1) AS field_salesmen,
           SUM(r.can_field_service = 0) AS store_only_salesmen,
           COUNT(DISTINCT r.branch_id) AS covered_branches
      FROM users u
      JOIN user_roles r ON r.user_id = u.id AND r.role_code = 'salesman'
     WHERE u.account_status = 'ACTIVE'`)
  console.log(`有效业务员: ${Number(summary.active_salesmen)}`)
  console.log(`可外派业务员: ${Number(summary.field_salesmen)}`)
  console.log(`仅到店业务员: ${Number(summary.store_only_salesmen)}`)
  console.log(`已覆盖网点: ${Number(summary.covered_branches)}`)

  let failed = false
  for (const [name, sql] of Object.entries(checks)) {
    const [[row]] = await db.query(sql)
    const count = Number(row.count)
    console.log(`${name}: ${count}`)
    if (count !== 0) failed = true
  }

  const [migrations] = await db.query(`
    SELECT version
      FROM schema_migrations
     WHERE version IN (
       '2026-07-23-unify-salesman-branch-capability-v11',
       '2026-07-23-reconcile-legacy-task-owners',
       '2026-07-23-canonicalize-task-assignee'
     )
     ORDER BY version`)
  console.log(`已应用迁移: ${migrations.map(item => item.version).join(', ')}`)
  if (migrations.length !== 3) failed = true

  if (failed) {
    throw new Error('业务员组织模型数据库验证失败')
  }
  console.log('业务员组织模型数据库验证通过。')
}

run()
  .then(() => db.end())
  .catch(async error => {
    console.error(error.message)
    await db.end()
    process.exitCode = 1
  })
