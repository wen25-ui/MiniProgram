const db = require('./db')
const config = require('./config')

async function columnNames(tableName = 'applications') {
  const [rows] = await db.execute(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [config.db.database, tableName]
  )
  return new Set(rows.map(row => row.COLUMN_NAME))
}

async function checkClause(name) {
  const [[row]] = await db.execute(
    'SELECT CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = ?',
    [config.db.database, name]
  )
  return row ? row.CHECK_CLAUSE : ''
}

async function ensureLocalAnswerColumns() {
  const columns = await columnNames()
  const additions = []
  if (!columns.has('is_local_number')) additions.push('ADD COLUMN is_local_number TINYINT(1) NULL AFTER local_option')
  if (!columns.has('accept_local_card')) additions.push('ADD COLUMN accept_local_card TINYINT(1) NULL AFTER is_local_number')
  if (!columns.has('is_local_resident')) additions.push('ADD COLUMN is_local_resident TINYINT(1) NULL AFTER accept_local_card')
  if (additions.length) await db.query(`ALTER TABLE applications ${additions.join(', ')}`)
}

async function ensureExpenseTierConstraint() {
  const clause = await checkClause('chk_applications_expense_tier')
  if (clause.includes('FROM_79')) return
  if (clause) await db.query('ALTER TABLE applications DROP CHECK chk_applications_expense_tier')
  await db.query("ALTER TABLE applications ADD CONSTRAINT chk_applications_expense_tier CHECK (expense_tier IS NULL OR expense_tier IN ('UNDER_79', 'FROM_79', 'FROM_150', 'FROM_250', 'FROM_400'))")
}

async function ensureWithdrawnStatus() {
  const clause = await checkClause('chk_applications_status')
  if (clause.includes('SERVICE_FAILED')) return
  if (clause) await db.query('ALTER TABLE applications DROP CHECK chk_applications_status')
  await db.query("ALTER TABLE applications ADD CONSTRAINT chk_applications_status CHECK (status IN ('DEMAND_SUBMITTED', 'APPLICATION_SUBMITTED', 'PRE_SCREEN_REJECTED', 'PENDING_REVIEW', 'REVIEW_REJECTED', 'PENDING_CONTACT', 'CONTACT_FAILED', 'CLIENT_DECLINED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'PENDING_SERVICE', 'IN_SERVICE', 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE', 'SERVICE_FAILED', 'PENDING_VERIFICATION', 'VERIFICATION_RETURNED', 'SERVICE_COMPLETED', 'WITHDRAWN', 'CLOSED'))")
}

async function ensureAdminRole() {
  const clause = await checkClause('chk_user_roles_code')
  if (clause.includes("'admin'")) return
  if (clause) await db.query('ALTER TABLE user_roles DROP CHECK chk_user_roles_code')
  await db.query("ALTER TABLE user_roles ADD CONSTRAINT chk_user_roles_code CHECK (role_code IN ('client', 'merchant', 'salesman', 'customer-service', 'finance', 'boss', 'admin'))")
}

async function ensureLoginName() {
  const columns = await columnNames('users')
  if (columns.has('login_name')) return
  await db.query('ALTER TABLE users MODIFY COLUMN phone VARCHAR(20) NULL, ADD COLUMN login_name VARCHAR(64) NULL AFTER phone, ADD UNIQUE KEY uk_users_login_name (login_name)')
}

async function ensureSalesmanType() {
  const columns = await columnNames('user_roles')
  if (!columns.has('salesman_type')) {
    await db.query("ALTER TABLE user_roles ADD COLUMN salesman_type VARCHAR(32) NULL AFTER salesman_code")
  }
  await db.query("UPDATE user_roles SET salesman_type = 'HOME_VISIT' WHERE role_code = 'salesman' AND salesman_type IS NULL")
}

async function ensureClientEntrySources() {
  await db.query(`CREATE TABLE IF NOT EXISTS client_entry_sources (
    user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    merchant_invite_id BIGINT UNSIGNED NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_client_entry_source_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_client_entry_source_invite FOREIGN KEY (merchant_invite_id) REFERENCES merchant_invites(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
}

async function ensureAssignedMerchant() {
  const columns = await columnNames()
  if (columns.has('assigned_merchant_id')) return
  await db.query('ALTER TABLE applications ADD COLUMN assigned_merchant_id BIGINT UNSIGNED NULL AFTER merchant_id, ADD KEY idx_applications_assigned_merchant (assigned_merchant_id), ADD CONSTRAINT fk_applications_assigned_merchant FOREIGN KEY (assigned_merchant_id) REFERENCES merchants(id)')
}

async function ensureServiceFlow() {
  const columns = await columnNames()
  const additions = []
  if (!columns.has('service_mode')) additions.push('ADD COLUMN service_mode VARCHAR(32) NULL AFTER status')
  if (!columns.has('contact_result')) additions.push('ADD COLUMN contact_result VARCHAR(32) NULL AFTER service_mode')
  if (!columns.has('contact_reason')) additions.push('ADD COLUMN contact_reason VARCHAR(500) NULL AFTER contact_result')
  if (!columns.has('service_failure_reason')) additions.push('ADD COLUMN service_failure_reason VARCHAR(500) NULL AFTER contact_reason')
  if (!columns.has('closed_reason')) additions.push('ADD COLUMN closed_reason VARCHAR(500) NULL AFTER service_failure_reason')
  if (additions.length) await db.query(`ALTER TABLE applications ${additions.join(', ')}`)

  const serviceModeClause = await checkClause('chk_applications_service_mode')
  if (!serviceModeClause) await db.query("ALTER TABLE applications ADD CONSTRAINT chk_applications_service_mode CHECK (service_mode IS NULL OR service_mode IN ('HOME_SERVICE', 'STORE_SERVICE'))")
  const contactResultClause = await checkClause('chk_applications_contact_result')
  if (!contactResultClause) await db.query("ALTER TABLE applications ADD CONSTRAINT chk_applications_contact_result CHECK (contact_result IS NULL OR contact_result IN ('CONTACTED', 'UNREACHABLE', 'CLIENT_DECLINED'))")

  await db.query(`CREATE TABLE IF NOT EXISTS application_contact_records (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    application_id CHAR(36) NOT NULL,
    operator_user_id BIGINT UNSIGNED NOT NULL,
    result VARCHAR(32) NOT NULL,
    remark VARCHAR(500) NULL,
    contacted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_contact_records_application (application_id, contacted_at),
    CONSTRAINT fk_contact_records_application FOREIGN KEY (application_id) REFERENCES applications(id),
    CONSTRAINT fk_contact_records_operator FOREIGN KEY (operator_user_id) REFERENCES users(id),
    CONSTRAINT chk_contact_records_result CHECK (result IN ('CONTACTED', 'UNREACHABLE', 'CLIENT_DECLINED'))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)

  const fulfillmentColumns = await columnNames('fulfillment_submissions')
  if (!fulfillmentColumns.has('submitted_by_user_id')) {
    await db.query('ALTER TABLE fulfillment_submissions MODIFY salesman_user_id BIGINT UNSIGNED NULL, ADD COLUMN submitted_by_user_id BIGINT UNSIGNED NULL AFTER salesman_user_id, ADD CONSTRAINT fk_fulfillment_submitter FOREIGN KEY (submitted_by_user_id) REFERENCES users(id)')
  }
}

async function run() {
  await ensureLocalAnswerColumns()
  await ensureExpenseTierConstraint()
  await ensureServiceFlow()
  await ensureWithdrawnStatus()
  await ensureAdminRole()
  await ensureLoginName()
  await ensureSalesmanType()
  await ensureClientEntrySources()
  await ensureAssignedMerchant()
  console.log('Database migrations are up to date.')
  await db.end()
}

run().catch(async error => {
  console.error(error)
  try { await db.end() } catch (_) {}
  process.exitCode = 1
})
