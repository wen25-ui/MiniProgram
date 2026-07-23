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

async function constraintExists(name) {
  const [[row]] = await db.execute(
    'SELECT 1 AS found FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = ? LIMIT 1',
    [config.db.database, name]
  )
  return Boolean(row)
}

async function indexExists(tableName, indexName) {
  const [[row]] = await db.execute(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [config.db.database, tableName, indexName]
  )
  return Boolean(row)
}

async function ensureCustomerAuditFlow() {
  const columns = await columnNames()
  const additions = []
  if (!columns.has('verify_result')) additions.push('ADD COLUMN verify_result VARCHAR(32) NULL AFTER service_mode')
  if (!columns.has('customer_intention')) additions.push('ADD COLUMN customer_intention VARCHAR(32) NULL AFTER verify_result')
  if (!columns.has('verification_remark')) additions.push('ADD COLUMN verification_remark VARCHAR(500) NULL AFTER customer_intention')
  if (!columns.has('corrected_info')) additions.push('ADD COLUMN corrected_info JSON NULL AFTER verification_remark')
  if (!columns.has('verified_by_user_id')) additions.push('ADD COLUMN verified_by_user_id BIGINT UNSIGNED NULL AFTER corrected_info')
  if (!columns.has('verified_at')) additions.push('ADD COLUMN verified_at DATETIME(3) NULL AFTER verified_by_user_id')
  if (!columns.has('intention_confirmed_at')) additions.push('ADD COLUMN intention_confirmed_at DATETIME(3) NULL AFTER verified_at')
  if (additions.length) await db.query(`ALTER TABLE applications ${additions.join(', ')}`)

  if (!(await constraintExists('fk_applications_verifier'))) {
    await db.query('ALTER TABLE applications ADD CONSTRAINT fk_applications_verifier FOREIGN KEY (verified_by_user_id) REFERENCES users(id)')
  }

  const verifyClause = await checkClause('chk_applications_verify_result')
  if (!verifyClause) await db.query("ALTER TABLE applications ADD CONSTRAINT chk_applications_verify_result CHECK (verify_result IS NULL OR verify_result IN ('VERIFIED', 'INVALID_INFO'))")
  const intentionClause = await checkClause('chk_applications_customer_intention')
  if (!intentionClause) await db.query("ALTER TABLE applications ADD CONSTRAINT chk_applications_customer_intention CHECK (customer_intention IS NULL OR customer_intention IN ('WILLING', 'UNWILLING'))")
  const statusClause = await checkClause('chk_applications_status')
  if (!statusClause.includes("'CONTACTING'")) {
    if (statusClause) await db.query('ALTER TABLE applications DROP CHECK chk_applications_status')
    await db.query("ALTER TABLE applications ADD CONSTRAINT chk_applications_status CHECK (status IN ('DEMAND_SUBMITTED', 'APPLICATION_SUBMITTED', 'PRE_SCREEN_REJECTED', 'PENDING', 'CONTACTING', 'VERIFYING', 'VERIFIED', 'INVALID_INFO', 'CORRECTING', 'CONFIRMED', 'CANCELLED', 'DISPATCHING', 'ASSIGNED', 'PROCESSING', 'COMPLETED', 'PENDING_REVIEW', 'REVIEW_REJECTED', 'PENDING_CONTACT', 'CONTACT_FAILED', 'CLIENT_DECLINED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'PENDING_SERVICE', 'IN_SERVICE', 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE', 'SERVICE_FAILED', 'PENDING_VERIFICATION', 'VERIFICATION_RETURNED', 'SERVICE_COMPLETED', 'WITHDRAWN', 'CLOSED'))")
  }
  await db.query("UPDATE applications SET status = CASE status WHEN 'PENDING_REVIEW' THEN 'PENDING' WHEN 'PENDING_CONTACT' THEN 'CONTACTING' WHEN 'CONTACT_FAILED' THEN 'CONTACTING' WHEN 'PENDING_SERVICE_MODE' THEN 'CONFIRMED' WHEN 'PENDING_APPOINTMENT' THEN 'CONFIRMED' WHEN 'PENDING_DISPATCH' THEN 'DISPATCHING' WHEN 'PENDING_SERVICE' THEN 'ASSIGNED' WHEN 'PENDING_STORE_SERVICE' THEN 'ASSIGNED' WHEN 'IN_SERVICE' THEN 'PROCESSING' WHEN 'IN_STORE_SERVICE' THEN 'PROCESSING' WHEN 'REVIEW_REJECTED' THEN 'CANCELLED' WHEN 'CLIENT_DECLINED' THEN 'CANCELLED' WHEN 'SERVICE_COMPLETED' THEN 'COMPLETED' ELSE status END")
}

async function ensureSalesmanTaskFlow() {
  const roleColumns = await columnNames('user_roles')
  if (!roleColumns.has('service_region')) await db.query('ALTER TABLE user_roles ADD COLUMN service_region VARCHAR(120) NULL AFTER salesman_type')
  const applicationColumns = await columnNames('applications')
  if (!applicationColumns.has('service_address')) await db.query('ALTER TABLE applications ADD COLUMN service_address VARCHAR(500) NULL AFTER appointment_time')
  if (!applicationColumns.has('service_region')) await db.query('ALTER TABLE applications ADD COLUMN service_region VARCHAR(120) NULL AFTER service_address')
  const merchantColumns = await columnNames('merchants')
  if (!merchantColumns.has('service_region')) await db.query('ALTER TABLE merchants ADD COLUMN service_region VARCHAR(120) NULL AFTER contact_phone')
  if (!roleColumns.has('assigned_merchant_id')) await db.query('ALTER TABLE user_roles ADD COLUMN assigned_merchant_id BIGINT UNSIGNED NULL AFTER merchant_id, ADD KEY idx_user_roles_assigned_merchant (assigned_merchant_id), ADD CONSTRAINT fk_user_roles_assigned_merchant FOREIGN KEY (assigned_merchant_id) REFERENCES merchants(id)')
  else if (!(await constraintExists('fk_user_roles_assigned_merchant'))) await db.query('ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_assigned_merchant FOREIGN KEY (assigned_merchant_id) REFERENCES merchants(id)')

  await db.query(`CREATE TABLE IF NOT EXISTS application_tasks (
    id CHAR(36) NOT NULL PRIMARY KEY,
    application_id CHAR(36) NOT NULL,
    service_type VARCHAR(32) NOT NULL,
    assignee_user_id BIGINT UNSIGNED NULL,
    store_id BIGINT UNSIGNED NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    customer_name VARCHAR(80) NULL,
    customer_phone VARCHAR(20) NOT NULL,
    service_address VARCHAR(500) NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING_ACCEPT',
    appointment_time DATETIME(0) NULL,
    contact_fail_count INT UNSIGNED NOT NULL DEFAULT 0,
    accepted_at DATETIME(3) NULL,
    contacted_at DATETIME(3) NULL,
    arrived_at DATETIME(3) NULL,
    started_at DATETIME(3) NULL,
    processing_finished_at DATETIME(3) NULL,
    result_uploaded_at DATETIME(3) NULL,
    completed_at DATETIME(3) NULL,
    fail_reason VARCHAR(500) NULL,
    version INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_application_tasks_application (application_id),
    KEY idx_application_tasks_assignee_status (assignee_user_id, status, appointment_time),
    KEY idx_application_tasks_store_status (store_id, status, appointment_time),
    CONSTRAINT fk_application_tasks_application FOREIGN KEY (application_id) REFERENCES applications(id),
    CONSTRAINT fk_application_tasks_assignee FOREIGN KEY (assignee_user_id) REFERENCES users(id),
    CONSTRAINT fk_application_tasks_store FOREIGN KEY (store_id) REFERENCES merchants(id),
    CONSTRAINT fk_application_tasks_customer FOREIGN KEY (customer_id) REFERENCES users(id),
    CONSTRAINT chk_application_tasks_service_type CHECK (service_type IN ('HOME_SERVICE', 'STORE_SERVICE')),
    CONSTRAINT chk_application_tasks_status CHECK (status IN ('PENDING_ACCEPT', 'ACCEPTED', 'WAITING_CONTACT', 'CONTACT_FAILED', 'CONTACTED', 'WAITING_TIME_CONFIRMATION', 'TIME_CONFIRMED', 'WAITING_HOME_SERVICE', 'WAITING_CUSTOMER_ARRIVAL', 'WAITING_START_CONFIRMATION', 'PROCESSING', 'PROCESSING_FAILED', 'WAITING_RESULT_UPLOAD', 'PENDING_VERIFICATION', 'COMPLETED', 'CANCELLED', 'ABNORMAL_CLOSED'))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)

  await db.query(`CREATE TABLE IF NOT EXISTS application_task_status_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    task_id CHAR(36) NOT NULL,
    old_status VARCHAR(40) NULL,
    new_status VARCHAR(40) NOT NULL,
    operator_user_id BIGINT UNSIGNED NULL,
    operator_role VARCHAR(32) NULL,
    operation VARCHAR(64) NOT NULL,
    remark VARCHAR(500) NULL,
    metadata JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_task_history_task_time (task_id, created_at),
    CONSTRAINT fk_task_history_task FOREIGN KEY (task_id) REFERENCES application_tasks(id),
    CONSTRAINT fk_task_history_operator FOREIGN KEY (operator_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)

  const contactColumns = await columnNames('application_contact_records')
  const contactAdditions = []
  if (!contactColumns.has('task_id')) contactAdditions.push('ADD COLUMN task_id CHAR(36) NULL AFTER application_id')
  if (!contactColumns.has('customer_id')) contactAdditions.push('ADD COLUMN customer_id BIGINT UNSIGNED NULL AFTER task_id')
  if (!contactColumns.has('contact_method')) contactAdditions.push("ADD COLUMN contact_method VARCHAR(24) NOT NULL DEFAULT 'PHONE' AFTER operator_user_id")
  if (!contactColumns.has('failure_reason')) contactAdditions.push('ADD COLUMN failure_reason VARCHAR(32) NULL AFTER result')
  if (!contactColumns.has('is_retry')) contactAdditions.push('ADD COLUMN is_retry TINYINT(1) NOT NULL DEFAULT 0 AFTER remark')
  if (contactAdditions.length) await db.query(`ALTER TABLE application_contact_records ${contactAdditions.join(', ')}`)
  if (!(await constraintExists('fk_contact_records_task'))) await db.query('ALTER TABLE application_contact_records ADD CONSTRAINT fk_contact_records_task FOREIGN KEY (task_id) REFERENCES application_tasks(id)')
  if (!(await constraintExists('fk_contact_records_customer'))) await db.query('ALTER TABLE application_contact_records ADD CONSTRAINT fk_contact_records_customer FOREIGN KEY (customer_id) REFERENCES users(id)')
  const contactClause = await checkClause('chk_contact_records_result')
  if (!contactClause.includes('CONTACT_SUCCESS')) {
    if (contactClause) await db.query('ALTER TABLE application_contact_records DROP CHECK chk_contact_records_result')
    await db.query("ALTER TABLE application_contact_records ADD CONSTRAINT chk_contact_records_result CHECK (result IN ('CONTACTED', 'UNREACHABLE', 'CLIENT_DECLINED', 'CONTACT_SUCCESS', 'CONTACT_FAILED'))")
  }

  const fulfillmentColumns = await columnNames('fulfillment_submissions')
  const fulfillmentAdditions = []
  if (!fulfillmentColumns.has('task_id')) fulfillmentAdditions.push('ADD COLUMN task_id CHAR(36) NULL AFTER id', 'ADD KEY idx_fulfillment_task (task_id, submitted_at)')
  if (!fulfillmentColumns.has('result_status')) fulfillmentAdditions.push("ADD COLUMN result_status VARCHAR(24) NOT NULL DEFAULT 'SUCCESS' AFTER identity_verified")
  if (!fulfillmentColumns.has('result_description')) fulfillmentAdditions.push('ADD COLUMN result_description VARCHAR(1000) NULL AFTER result_status')
  if (fulfillmentAdditions.length) await db.query(`ALTER TABLE fulfillment_submissions ${fulfillmentAdditions.join(', ')}`)
  if (!(await constraintExists('fk_fulfillment_task'))) await db.query('ALTER TABLE fulfillment_submissions ADD CONSTRAINT fk_fulfillment_task FOREIGN KEY (task_id) REFERENCES application_tasks(id)')
  if (!(await constraintExists('chk_fulfillment_result_status'))) await db.query("ALTER TABLE fulfillment_submissions ADD CONSTRAINT chk_fulfillment_result_status CHECK (result_status IN ('SUCCESS', 'FAILED'))")

  await db.query(`INSERT INTO application_tasks (
      id, application_id, service_type, assignee_user_id, store_id, customer_id,
      customer_name, customer_phone, status, appointment_time, started_at,
      result_uploaded_at, completed_at, fail_reason, created_at, updated_at
    )
    SELECT UUID(), a.id, a.service_mode, a.assigned_salesman_user_id, a.assigned_merchant_id,
           a.client_user_id, u.display_name, a.phone_snapshot,
           CASE a.status WHEN 'ASSIGNED' THEN 'PENDING_ACCEPT' WHEN 'PROCESSING' THEN 'PROCESSING'
             WHEN 'PENDING_VERIFICATION' THEN 'PENDING_VERIFICATION' WHEN 'VERIFICATION_RETURNED' THEN 'WAITING_RESULT_UPLOAD'
             WHEN 'COMPLETED' THEN 'COMPLETED' WHEN 'SERVICE_FAILED' THEN 'ABNORMAL_CLOSED' ELSE 'PENDING_ACCEPT' END,
           a.appointment_time,
           CASE WHEN a.status IN ('PROCESSING','PENDING_VERIFICATION','VERIFICATION_RETURNED','COMPLETED','SERVICE_FAILED') THEN a.updated_at END,
           CASE WHEN a.status IN ('PENDING_VERIFICATION','VERIFICATION_RETURNED','COMPLETED') THEN a.updated_at END,
           CASE WHEN a.status = 'COMPLETED' THEN a.updated_at END,
           a.service_failure_reason, a.created_at, a.updated_at
      FROM applications a JOIN users u ON u.id = a.client_user_id
     WHERE a.service_mode IN ('HOME_SERVICE','STORE_SERVICE')
       AND a.status IN ('ASSIGNED','PROCESSING','PENDING_VERIFICATION','VERIFICATION_RETURNED','COMPLETED','SERVICE_FAILED')
    ON DUPLICATE KEY UPDATE application_id = VALUES(application_id)`)
  await db.query('UPDATE fulfillment_submissions f JOIN application_tasks t ON t.application_id = f.application_id SET f.task_id = t.id WHERE f.task_id IS NULL')
  await db.query('UPDATE fulfillment_submissions SET result_description = voucher_remark WHERE result_description IS NULL')
  await db.query(`INSERT INTO application_task_status_history (task_id, old_status, new_status, operator_role, operation, remark, created_at)
    SELECT t.id, NULL, t.status, 'system', 'TASK_BACKFILLED', '由历史订单生成兼容任务', t.created_at
      FROM application_tasks t
     WHERE NOT EXISTS (SELECT 1 FROM application_task_status_history h WHERE h.task_id = t.id)`)
  await db.query("INSERT INTO schema_migrations (version) VALUES ('2026-07-22-add-salesman-task-flow') ON DUPLICATE KEY UPDATE version = VALUES(version)")
}

async function ensureAdministrativeAreaDispatch() {
  await db.query(`CREATE TABLE IF NOT EXISTS sys_area (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, parent_id BIGINT UNSIGNED NULL,
    name VARCHAR(80) NOT NULL, level TINYINT UNSIGNED NOT NULL,
    UNIQUE KEY uk_sys_area_parent_name (parent_id, name), KEY idx_sys_area_parent_level (parent_id, level),
    CONSTRAINT fk_sys_area_parent FOREIGN KEY (parent_id) REFERENCES sys_area(id),
    CONSTRAINT chk_sys_area_level CHECK (level IN (1, 2, 3))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
  await db.query(`CREATE TABLE IF NOT EXISTS sys_area_neighbor (
    area_id BIGINT UNSIGNED NOT NULL, neighbor_area_id BIGINT UNSIGNED NOT NULL, sort_order INT UNSIGNED NOT NULL,
    PRIMARY KEY (area_id, neighbor_area_id), UNIQUE KEY uk_sys_area_neighbor_order (area_id, sort_order),
    CONSTRAINT fk_sys_area_neighbor_area FOREIGN KEY (area_id) REFERENCES sys_area(id),
    CONSTRAINT fk_sys_area_neighbor_target FOREIGN KEY (neighbor_area_id) REFERENCES sys_area(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
  const applicationColumns = await columnNames('applications')
  const applicationAdditions = []
  for (const [name, definition] of [
    ['province', 'VARCHAR(80) NULL'], ['city', 'VARCHAR(80) NULL'], ['district', 'VARCHAR(80) NULL'],
    ['detail_address', 'VARCHAR(500) NULL'], ['district_area_id', 'BIGINT UNSIGNED NULL'],
    ['latitude', 'DECIMAL(10,7) NULL'], ['longitude', 'DECIMAL(10,7) NULL']
  ]) if (!applicationColumns.has(name)) applicationAdditions.push(`ADD COLUMN ${name} ${definition}`)
  if (applicationAdditions.length) await db.query(`ALTER TABLE applications ${applicationAdditions.join(', ')}`)
  if (!(await indexExists('applications', 'idx_applications_district_status'))) await db.query('ALTER TABLE applications ADD KEY idx_applications_district_status (district_area_id, status)')
  if (!(await constraintExists('fk_applications_district_area'))) await db.query('ALTER TABLE applications ADD CONSTRAINT fk_applications_district_area FOREIGN KEY (district_area_id) REFERENCES sys_area(id)')
  const merchantColumns = await columnNames('merchants')
  const merchantAdditions = []
  for (const [name, definition] of [['area_id', 'BIGINT UNSIGNED NULL'], ['latitude', 'DECIMAL(10,7) NULL'], ['longitude', 'DECIMAL(10,7) NULL']]) {
    if (!merchantColumns.has(name)) merchantAdditions.push(`ADD COLUMN ${name} ${definition}`)
  }
  if (merchantAdditions.length) await db.query(`ALTER TABLE merchants ${merchantAdditions.join(', ')}`)
  if (!(await indexExists('merchants', 'idx_merchants_area_status'))) await db.query('ALTER TABLE merchants ADD KEY idx_merchants_area_status (area_id, status)')
  if (!(await constraintExists('fk_merchants_area'))) await db.query('ALTER TABLE merchants ADD CONSTRAINT fk_merchants_area FOREIGN KEY (area_id) REFERENCES sys_area(id)')
  const roleColumns = await columnNames('user_roles')
  if (!roleColumns.has('area_id')) await db.query('ALTER TABLE user_roles ADD COLUMN area_id BIGINT UNSIGNED NULL')
  if (!(await indexExists('user_roles', 'idx_user_roles_salesman_area'))) await db.query('ALTER TABLE user_roles ADD KEY idx_user_roles_salesman_area (role_code, salesman_type, area_id)')
  if (!(await constraintExists('fk_user_roles_area'))) await db.query('ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_area FOREIGN KEY (area_id) REFERENCES sys_area(id)')

  await db.query("INSERT INTO sys_area (parent_id, name, level) SELECT NULL, '四川省', 1 WHERE NOT EXISTS (SELECT 1 FROM sys_area WHERE parent_id IS NULL AND name = '四川省')")
  const [[province]] = await db.query("SELECT id FROM sys_area WHERE parent_id IS NULL AND name = '四川省' LIMIT 1")
  await db.query("INSERT INTO sys_area (parent_id, name, level) SELECT ?, '成都市', 2 WHERE NOT EXISTS (SELECT 1 FROM sys_area WHERE parent_id = ? AND name = '成都市')", [province.id, province.id])
  const [[city]] = await db.query("SELECT id FROM sys_area WHERE parent_id = ? AND name = '成都市' LIMIT 1", [province.id])
  const districts = ['锦江区','青羊区','金牛区','武侯区','成华区','龙泉驿区','青白江区','新都区','温江区','双流区','郫都区','新津区','都江堰市','彭州市','邛崃市','崇州市','简阳市','金堂县','大邑县','蒲江县']
  for (const district of districts) await db.query('INSERT INTO sys_area (parent_id, name, level) SELECT ?, ?, 3 WHERE NOT EXISTS (SELECT 1 FROM sys_area WHERE parent_id = ? AND name = ?)', [city.id, district, city.id, district])
  await db.query("UPDATE merchants m JOIN sys_area a ON a.level = 3 AND a.name = m.service_region SET m.area_id = a.id WHERE m.area_id IS NULL")
  await db.query("UPDATE user_roles r JOIN sys_area a ON a.level = 3 AND a.name = r.service_region SET r.area_id = a.id WHERE r.area_id IS NULL")
  await db.query("UPDATE applications a JOIN sys_area d ON d.level = 3 AND d.name = a.service_region SET a.district = d.name, a.district_area_id = d.id, a.detail_address = a.service_address WHERE a.district_area_id IS NULL")
  await db.query("INSERT INTO schema_migrations (version) VALUES ('2026-07-22-administrative-area-dispatch') ON DUPLICATE KEY UPDATE version = VALUES(version)")
}

async function run() {
  await ensureLocalAnswerColumns()
  await ensureExpenseTierConstraint()
  await ensureServiceFlow()
  await ensureCustomerAuditFlow()
  await ensureWithdrawnStatus()
  await ensureAdminRole()
  await ensureLoginName()
  await ensureSalesmanType()
  await ensureClientEntrySources()
  await ensureAssignedMerchant()
  await ensureSalesmanTaskFlow()
  await ensureAdministrativeAreaDispatch()
  console.log('Database migrations are up to date.')
  await db.end()
}

run().catch(async error => {
  console.error(error)
  try { await db.end() } catch (_) {}
  process.exitCode = 1
})
