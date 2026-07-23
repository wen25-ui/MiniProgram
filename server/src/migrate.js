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

  const currentTaskColumns = await columnNames('application_tasks')
  const branchColumns = currentTaskColumns.has('branch_id') ? ', branch_id, assign_type' : ''
  const branchValues = currentTaskColumns.has('branch_id') ? ", a.branch_id, COALESCE(a.assign_type, 'BRANCH_ASSIGN')" : ''
  await db.query(`INSERT INTO application_tasks (
      id, application_id, service_type, assignee_user_id, store_id${branchColumns}, customer_id,
      customer_name, customer_phone, status, appointment_time, started_at,
      result_uploaded_at, completed_at, fail_reason, created_at, updated_at
    )
    SELECT UUID(), a.id, a.service_mode, a.assigned_salesman_user_id, a.assigned_merchant_id${branchValues},
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

async function ensureBranchAssignmentModels() {
  await db.query(`CREATE TABLE IF NOT EXISTS branches (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    merchant_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    address VARCHAR(500) NULL,
    contact_name VARCHAR(80) NULL,
    contact_phone VARCHAR(20) NULL,
    manager_id BIGINT UNSIGNED NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_branches_merchant_name (merchant_id, name),
    KEY idx_branches_merchant_status (merchant_id, status),
    KEY idx_branches_manager (manager_id),
    CONSTRAINT fk_branches_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    CONSTRAINT fk_branches_manager FOREIGN KEY (manager_id) REFERENCES users(id),
    CONSTRAINT chk_branches_status CHECK (status IN ('ACTIVE', 'DISABLED'))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)

  const roleColumns = await columnNames('user_roles')
  if (!roleColumns.has('branch_id')) await db.query('ALTER TABLE user_roles ADD COLUMN branch_id BIGINT UNSIGNED NULL AFTER assigned_merchant_id')
  if (!(await indexExists('user_roles', 'idx_user_roles_salesman_branch'))) await db.query('CREATE INDEX idx_user_roles_salesman_branch ON user_roles (role_code, branch_id, user_id)')
  if (!(await constraintExists('fk_user_roles_branch'))) await db.query('ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_branch FOREIGN KEY (branch_id) REFERENCES branches(id)')

  const applicationColumns = await columnNames('applications')
  const applicationAdditions = []
  if (!applicationColumns.has('branch_id')) applicationAdditions.push('ADD COLUMN branch_id BIGINT UNSIGNED NULL AFTER assigned_merchant_id')
  if (!applicationColumns.has('current_salesman_id')) applicationAdditions.push('ADD COLUMN current_salesman_id BIGINT UNSIGNED NULL AFTER branch_id')
  if (!applicationColumns.has('assign_type')) applicationAdditions.push('ADD COLUMN assign_type VARCHAR(32) NULL AFTER current_salesman_id')
  if (applicationAdditions.length) await db.query(`ALTER TABLE applications ${applicationAdditions.join(', ')}`)
  if (!(await indexExists('applications', 'idx_applications_branch_status'))) await db.query('CREATE INDEX idx_applications_branch_status ON applications (branch_id, status, updated_at)')
  if (!(await indexExists('applications', 'idx_applications_current_salesman_status'))) await db.query('CREATE INDEX idx_applications_current_salesman_status ON applications (current_salesman_id, status, updated_at)')
  if (!(await constraintExists('fk_applications_branch'))) await db.query('ALTER TABLE applications ADD CONSTRAINT fk_applications_branch FOREIGN KEY (branch_id) REFERENCES branches(id)')
  if (!(await constraintExists('fk_applications_current_salesman'))) await db.query('ALTER TABLE applications ADD CONSTRAINT fk_applications_current_salesman FOREIGN KEY (current_salesman_id) REFERENCES users(id)')
  if (!(await constraintExists('chk_applications_assign_type'))) await db.query("ALTER TABLE applications ADD CONSTRAINT chk_applications_assign_type CHECK (assign_type IS NULL OR assign_type IN ('BRANCH_ASSIGN', 'SALESMAN_GRAB', 'TRANSFER'))")

  const taskColumns = await columnNames('application_tasks')
  const taskAdditions = []
  if (!taskColumns.has('branch_id')) taskAdditions.push('ADD COLUMN branch_id BIGINT UNSIGNED NULL AFTER store_id')
  if (!taskColumns.has('assign_type')) taskAdditions.push('ADD COLUMN assign_type VARCHAR(32) NULL AFTER branch_id')
  if (taskAdditions.length) await db.query(`ALTER TABLE application_tasks ${taskAdditions.join(', ')}`)
  if (!(await indexExists('application_tasks', 'idx_application_tasks_branch_pool'))) await db.query('CREATE INDEX idx_application_tasks_branch_pool ON application_tasks (branch_id, assignee_user_id, status, updated_at)')
  if (!(await constraintExists('fk_application_tasks_branch'))) await db.query('ALTER TABLE application_tasks ADD CONSTRAINT fk_application_tasks_branch FOREIGN KEY (branch_id) REFERENCES branches(id)')
  if (!(await constraintExists('chk_application_tasks_assign_type'))) await db.query("ALTER TABLE application_tasks ADD CONSTRAINT chk_application_tasks_assign_type CHECK (assign_type IS NULL OR assign_type IN ('BRANCH_ASSIGN', 'SALESMAN_GRAB', 'TRANSFER'))")

  await db.query(`CREATE TABLE IF NOT EXISTS order_assignments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id CHAR(36) NOT NULL,
    branch_id BIGINT UNSIGNED NULL,
    salesman_id BIGINT UNSIGNED NULL,
    assign_type VARCHAR(32) NOT NULL,
    operator_id BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_order_assignments_order (order_id, created_at),
    KEY idx_order_assignments_branch (branch_id, created_at),
    KEY idx_order_assignments_salesman (salesman_id, created_at),
    CONSTRAINT fk_order_assignments_order FOREIGN KEY (order_id) REFERENCES applications(id),
    CONSTRAINT fk_order_assignments_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_order_assignments_salesman FOREIGN KEY (salesman_id) REFERENCES users(id),
    CONSTRAINT fk_order_assignments_operator FOREIGN KEY (operator_id) REFERENCES users(id),
    CONSTRAINT chk_order_assignments_type CHECK (assign_type IN ('BRANCH_ASSIGN', 'SALESMAN_GRAB', 'TRANSFER'))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
  await db.query(`CREATE TABLE IF NOT EXISTS order_transfer_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id CHAR(36) NOT NULL,
    from_salesman_id BIGINT UNSIGNED NOT NULL,
    to_salesman_id BIGINT UNSIGNED NOT NULL,
    reason VARCHAR(500) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_order_transfer_logs_order (order_id, created_at),
    KEY idx_order_transfer_logs_receiver (to_salesman_id, status, created_at),
    CONSTRAINT fk_order_transfer_logs_order FOREIGN KEY (order_id) REFERENCES applications(id),
    CONSTRAINT fk_order_transfer_logs_from FOREIGN KEY (from_salesman_id) REFERENCES users(id),
    CONSTRAINT fk_order_transfer_logs_to FOREIGN KEY (to_salesman_id) REFERENCES users(id),
    CONSTRAINT chk_order_transfer_logs_status CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED'))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
  await db.query(`CREATE TABLE IF NOT EXISTS order_grab_records (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id CHAR(36) NOT NULL,
    salesman_id BIGINT UNSIGNED NOT NULL,
    grab_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    result VARCHAR(32) NOT NULL,
    KEY idx_order_grab_records_order (order_id, grab_time),
    KEY idx_order_grab_records_salesman (salesman_id, grab_time),
    CONSTRAINT fk_order_grab_records_order FOREIGN KEY (order_id) REFERENCES applications(id),
    CONSTRAINT fk_order_grab_records_salesman FOREIGN KEY (salesman_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
  await db.query(`CREATE TABLE IF NOT EXISTS review_questions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    type VARCHAR(32) NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    parent_answer VARCHAR(500) NULL,
    \`sort\` INT NOT NULL DEFAULT 0,
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    KEY idx_review_questions_parent_sort (parent_id, \`sort\`),
    KEY idx_review_questions_status_sort (status, \`sort\`),
    CONSTRAINT fk_review_questions_parent FOREIGN KEY (parent_id) REFERENCES review_questions(id),
    CONSTRAINT chk_review_questions_status CHECK (status IN ('ACTIVE', 'DISABLED'))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
  await db.query(`CREATE TABLE IF NOT EXISTS review_answers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id CHAR(36) NOT NULL,
    question_id BIGINT UNSIGNED NOT NULL,
    answer TEXT NOT NULL,
    operator_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_review_answers_order (order_id, created_at),
    KEY idx_review_answers_question (question_id, created_at),
    CONSTRAINT fk_review_answers_order FOREIGN KEY (order_id) REFERENCES applications(id),
    CONSTRAINT fk_review_answers_question FOREIGN KEY (question_id) REFERENCES review_questions(id),
    CONSTRAINT fk_review_answers_operator FOREIGN KEY (operator_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
  await db.query(`CREATE TABLE IF NOT EXISTS customer_internal_tags (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_id BIGINT UNSIGNED NOT NULL,
    tag VARCHAR(80) NOT NULL,
    operator_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_customer_internal_tags_customer_tag (customer_id, tag),
    KEY idx_customer_internal_tags_customer (customer_id, created_at),
    CONSTRAINT fk_customer_internal_tags_customer FOREIGN KEY (customer_id) REFERENCES users(id),
    CONSTRAINT fk_customer_internal_tags_operator FOREIGN KEY (operator_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
  await db.query(`CREATE TABLE IF NOT EXISTS customer_internal_notes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_id BIGINT UNSIGNED NOT NULL,
    content TEXT NOT NULL,
    operator_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_customer_internal_notes_customer (customer_id, created_at),
    CONSTRAINT fk_customer_internal_notes_customer FOREIGN KEY (customer_id) REFERENCES users(id),
    CONSTRAINT fk_customer_internal_notes_operator FOREIGN KEY (operator_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)

  await db.query(`INSERT INTO branches (merchant_id, name, address, contact_name, contact_phone, status, created_at, updated_at)
    SELECT m.id, m.name, NULL, m.contact_name, m.contact_phone, m.status, m.created_at, m.updated_at
      FROM merchants m
     WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.merchant_id = m.id AND b.name = m.name)`)
  await db.query(`UPDATE user_roles r
    JOIN merchants m ON m.id = r.assigned_merchant_id
    JOIN branches b ON b.merchant_id = m.id AND b.name = m.name
       SET r.branch_id = b.id
     WHERE r.role_code = 'salesman' AND r.branch_id IS NULL`)
  await db.query(`UPDATE applications a
    JOIN merchants m ON m.id = a.assigned_merchant_id
    JOIN branches b ON b.merchant_id = m.id AND b.name = m.name
       SET a.branch_id = b.id
     WHERE a.branch_id IS NULL`)
  await db.query('UPDATE applications SET current_salesman_id = assigned_salesman_user_id WHERE current_salesman_id IS NULL AND assigned_salesman_user_id IS NOT NULL')
  await db.query("UPDATE applications SET assign_type = 'BRANCH_ASSIGN' WHERE assign_type IS NULL AND (branch_id IS NOT NULL OR current_salesman_id IS NOT NULL)")
  await db.query(`UPDATE application_tasks t
    JOIN applications a ON a.id = t.application_id
       SET t.branch_id = a.branch_id, t.assign_type = COALESCE(a.assign_type, 'BRANCH_ASSIGN')
     WHERE t.branch_id IS NULL OR t.assign_type IS NULL`)
  await db.query("INSERT INTO schema_migrations (version) VALUES ('2026-07-23-add-branch-and-assignment-models') ON DUPLICATE KEY UPDATE version = VALUES(version)")
}

async function salesmanOrganizationPreflight() {
  const [salesmen] = await db.query(
    `WITH candidate_branches AS (
       SELECT b.id, b.merchant_id, b.name, b.status, m.area_id, m.service_region
         FROM branches b JOIN merchants m ON m.id = b.merchant_id
       UNION ALL
       SELECT -m.id, m.id, m.name, m.status, m.area_id, m.service_region
         FROM merchants m
        WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.merchant_id = m.id)
     )
     SELECT u.id, u.display_name, u.phone, r.salesman_type, r.service_region, r.area_id,
            r.assigned_merchant_id, r.branch_id,
            CASE
              WHEN existing.id IS NOT NULL AND existing.status = 'ACTIVE' THEN existing.id
              WHEN named_branch.candidate_count = 1 THEN named_branch.branch_id
              WHEN merchant_branch.candidate_count = 1 THEN merchant_branch.branch_id
              WHEN area_branch.candidate_count = 1 THEN area_branch.branch_id
              WHEN region_branch.candidate_count = 1 THEN region_branch.branch_id
              ELSE NULL
            END AS mapped_branch_id
       FROM users u
       JOIN user_roles r ON r.user_id = u.id AND r.role_code = 'salesman'
       LEFT JOIN branches existing ON existing.id = r.branch_id
       LEFT JOIN (
         SELECT cb.merchant_id, MIN(cb.id) AS branch_id, COUNT(*) AS candidate_count
           FROM candidate_branches cb JOIN merchants m ON m.id = cb.merchant_id AND cb.name = m.name
          WHERE cb.status = 'ACTIVE' GROUP BY cb.merchant_id
       ) named_branch ON named_branch.merchant_id = r.assigned_merchant_id
       LEFT JOIN (
         SELECT merchant_id, MIN(id) AS branch_id, COUNT(*) AS candidate_count
           FROM candidate_branches WHERE status = 'ACTIVE' GROUP BY merchant_id
       ) merchant_branch ON merchant_branch.merchant_id = r.assigned_merchant_id
       LEFT JOIN (
         SELECT area_id, MIN(id) AS branch_id, COUNT(*) AS candidate_count
           FROM candidate_branches WHERE status = 'ACTIVE' AND area_id IS NOT NULL GROUP BY area_id
       ) area_branch ON area_branch.area_id = r.area_id
       LEFT JOIN (
         SELECT service_region, MIN(id) AS branch_id, COUNT(*) AS candidate_count
           FROM candidate_branches
          WHERE status = 'ACTIVE' AND service_region IS NOT NULL AND service_region <> ''
          GROUP BY service_region
       ) region_branch ON region_branch.service_region = r.service_region
      WHERE u.account_status = 'ACTIVE'
      ORDER BY u.id`
  )
  const unmapped = salesmen.filter(row => row.mapped_branch_id === null)
  console.log(`数据库主机: ${config.db.host}`)
  console.log(`数据库端口: ${config.db.port}`)
  console.log(`数据库名称: ${config.db.database}`)
  console.log('迁移文件: database/migrations/20260723_unify_salesman_branch_capability.sql')
  console.log(`预计回填业务员数量: ${salesmen.filter(row => !row.branch_id).length}`)
  console.log(`无法映射网点的业务员数量: ${unmapped.length}`)
  if (unmapped.length) {
    console.table(unmapped.map(row => ({
      userId: row.id,
      name: row.display_name,
      phone: row.phone,
      salesmanType: row.salesman_type,
      serviceRegion: row.service_region,
      areaId: row.area_id,
      assignedMerchantId: row.assigned_merchant_id
    })))
    throw new Error('业务员组织迁移预检失败：存在无法唯一映射网点的人员')
  }
}

async function ensureSalesmanOrganizationV11() {
  const columns = await columnNames('user_roles')
  const [[appliedMigration]] = await db.query(
    "SELECT version FROM schema_migrations WHERE version = '2026-07-23-unify-salesman-branch-capability-v11' LIMIT 1"
  )
  const needsLegacyCapabilityBackfill = !appliedMigration

  if (!columns.has('can_field_service')) {
    await db.query('ALTER TABLE user_roles ADD COLUMN can_field_service TINYINT(1) NOT NULL DEFAULT 0 AFTER salesman_type')
  }
  if (!(await constraintExists('chk_user_roles_can_field_service'))) {
    await db.query('ALTER TABLE user_roles ADD CONSTRAINT chk_user_roles_can_field_service CHECK (can_field_service IN (0, 1))')
  }
  if (!(await indexExists('user_roles', 'idx_user_roles_salesman_branch_capability'))) {
    await db.query('CREATE INDEX idx_user_roles_salesman_branch_capability ON user_roles (role_code, branch_id, can_field_service, user_id)')
  }

  await db.query(`INSERT INTO branches
    (merchant_id, name, contact_name, contact_phone, status, created_at, updated_at)
    SELECT m.id, m.name, m.contact_name, m.contact_phone, m.status, m.created_at, m.updated_at
      FROM merchants m
     WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.merchant_id = m.id)`)
  await db.query(`UPDATE user_roles r
    JOIN branches b ON b.merchant_id = r.assigned_merchant_id AND b.status = 'ACTIVE'
    JOIN merchants m ON m.id = r.assigned_merchant_id AND b.name = m.name
       SET r.branch_id = b.id
     WHERE r.role_code = 'salesman' AND r.branch_id IS NULL`)
  await db.query(`UPDATE user_roles r
    JOIN (SELECT merchant_id, MIN(id) branch_id FROM branches WHERE status = 'ACTIVE'
          GROUP BY merchant_id HAVING COUNT(*) = 1) c ON c.merchant_id = r.assigned_merchant_id
       SET r.branch_id = c.branch_id
     WHERE r.role_code = 'salesman' AND r.branch_id IS NULL`)
  await db.query(`UPDATE user_roles r
    JOIN (SELECT m.area_id, MIN(b.id) branch_id
            FROM branches b JOIN merchants m ON m.id = b.merchant_id
           WHERE b.status = 'ACTIVE' AND m.status = 'ACTIVE' AND m.area_id IS NOT NULL
           GROUP BY m.area_id HAVING COUNT(*) = 1) c ON c.area_id = r.area_id
       SET r.branch_id = c.branch_id
     WHERE r.role_code = 'salesman' AND r.branch_id IS NULL`)
  await db.query(`UPDATE user_roles r
    JOIN (SELECT m.service_region, MIN(b.id) branch_id
            FROM branches b JOIN merchants m ON m.id = b.merchant_id
           WHERE b.status = 'ACTIVE' AND m.status = 'ACTIVE'
             AND m.service_region IS NOT NULL AND m.service_region <> ''
           GROUP BY m.service_region HAVING COUNT(*) = 1) c ON c.service_region = r.service_region
       SET r.branch_id = c.branch_id
     WHERE r.role_code = 'salesman' AND r.branch_id IS NULL`)
  if (needsLegacyCapabilityBackfill) {
    await db.query(`UPDATE user_roles
       SET can_field_service = CASE WHEN salesman_type = 'HOME_VISIT' THEN 1 ELSE 0 END
     WHERE role_code = 'salesman'`)
  }

  const [unmapped] = await db.query(`SELECT u.id, u.display_name, u.phone, r.service_region, r.area_id
    FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role_code = 'salesman'
    LEFT JOIN branches b ON b.id = r.branch_id AND b.status = 'ACTIVE'
   WHERE u.account_status = 'ACTIVE' AND b.id IS NULL`)
  if (unmapped.length) {
    console.table(unmapped)
    throw new Error('存在无法唯一映射到有效网点的 ACTIVE 业务员')
  }

  await db.query(`UPDATE applications a
    JOIN (SELECT merchant_id, MIN(id) branch_id FROM branches GROUP BY merchant_id HAVING COUNT(*) = 1) c
      ON c.merchant_id = a.assigned_merchant_id
     SET a.branch_id = c.branch_id WHERE a.branch_id IS NULL`)
  await db.query(`UPDATE applications a
    JOIN user_roles r ON r.user_id = COALESCE(a.current_salesman_id, a.assigned_salesman_user_id)
                     AND r.role_code = 'salesman'
     SET a.branch_id = r.branch_id WHERE a.branch_id IS NULL AND r.branch_id IS NOT NULL`)
  await db.query(`UPDATE applications a
    JOIN (SELECT m.area_id, MIN(b.id) branch_id
            FROM branches b JOIN merchants m ON m.id = b.merchant_id
           WHERE b.status = 'ACTIVE' AND m.status = 'ACTIVE' AND m.area_id IS NOT NULL
           GROUP BY m.area_id HAVING COUNT(*) = 1) c ON c.area_id = a.district_area_id
     SET a.branch_id = c.branch_id WHERE a.branch_id IS NULL`)
  await db.query('UPDATE applications SET current_salesman_id = assigned_salesman_user_id WHERE current_salesman_id IS NULL AND assigned_salesman_user_id IS NOT NULL')
  await db.query(`UPDATE application_tasks t JOIN applications a ON a.id = t.application_id
     SET t.branch_id = a.branch_id WHERE t.branch_id IS NULL AND a.branch_id IS NOT NULL`)
  await db.query(`UPDATE application_tasks t
    JOIN user_roles r ON r.user_id = t.assignee_user_id AND r.role_code = 'salesman'
     SET t.branch_id = r.branch_id WHERE t.branch_id IS NULL AND r.branch_id IS NOT NULL`)
  await db.query(`UPDATE applications a JOIN application_tasks t ON t.application_id = a.id
     SET a.branch_id = t.branch_id WHERE a.branch_id IS NULL AND t.branch_id IS NOT NULL`)
  const [[taskCheck]] = await db.query('SELECT COUNT(*) AS count FROM application_tasks WHERE branch_id IS NULL')
  if (Number(taskCheck.count)) throw new Error(`存在 ${taskCheck.count} 个无法确定负责网点的历史执行任务`)
  await db.query('ALTER TABLE application_tasks MODIFY branch_id BIGINT UNSIGNED NOT NULL')
  await db.query("INSERT INTO schema_migrations (version) VALUES ('2026-07-23-unify-salesman-branch-capability-v11') ON DUPLICATE KEY UPDATE version = VALUES(version)")
}

async function ensureLegacyTaskOwnerReconciliation() {
  await db.query(`UPDATE applications a
    JOIN application_tasks t ON t.application_id = a.id
       SET a.current_salesman_id = t.assignee_user_id,
           a.assigned_salesman_user_id = COALESCE(a.assigned_salesman_user_id, t.assignee_user_id)
     WHERE a.current_salesman_id IS NULL AND t.assignee_user_id IS NOT NULL`)
  await db.query(`UPDATE applications a
    JOIN user_roles r ON r.user_id = a.current_salesman_id AND r.role_code = 'salesman'
       SET a.branch_id = r.branch_id
     WHERE a.current_salesman_id IS NOT NULL AND r.branch_id IS NOT NULL
       AND NOT (a.branch_id <=> r.branch_id)`)
  await db.query(`UPDATE application_tasks t
    JOIN user_roles r ON r.user_id = t.assignee_user_id AND r.role_code = 'salesman'
       SET t.branch_id = r.branch_id
     WHERE t.assignee_user_id IS NOT NULL AND r.branch_id IS NOT NULL
       AND NOT (t.branch_id <=> r.branch_id)`)
  await db.query(`UPDATE application_tasks t
    JOIN applications a ON a.id = t.application_id
       SET t.branch_id = a.branch_id
     WHERE t.assignee_user_id IS NULL AND a.branch_id IS NOT NULL
       AND NOT (t.branch_id <=> a.branch_id)`)
  await db.query("INSERT INTO schema_migrations (version) VALUES ('2026-07-23-reconcile-legacy-task-owners') ON DUPLICATE KEY UPDATE version = VALUES(version)")
}

async function ensureCanonicalTaskAssignee() {
  await db.query(`UPDATE applications a
    JOIN application_tasks t ON t.application_id = a.id
    JOIN user_roles r ON r.user_id = t.assignee_user_id AND r.role_code = 'salesman'
       SET a.current_salesman_id = t.assignee_user_id,
           a.assigned_salesman_user_id = t.assignee_user_id,
           a.branch_id = r.branch_id,
           t.branch_id = r.branch_id
     WHERE t.assignee_user_id IS NOT NULL
       AND (
         NOT (a.current_salesman_id <=> t.assignee_user_id)
         OR NOT (a.assigned_salesman_user_id <=> t.assignee_user_id)
         OR NOT (a.branch_id <=> r.branch_id)
         OR NOT (t.branch_id <=> r.branch_id)
       )`)
  await db.query("INSERT INTO schema_migrations (version) VALUES ('2026-07-23-canonicalize-task-assignee') ON DUPLICATE KEY UPDATE version = VALUES(version)")
}

async function ensureCustomerServiceTaskFlow() {
  await db.query(`CREATE TABLE IF NOT EXISTS customer_service_tasks (
    id CHAR(36) NOT NULL PRIMARY KEY,
    application_id CHAR(36) NOT NULL,
    assignee_user_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ASSIGNED',
    assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    started_at DATETIME(3) NULL,
    wait_dispatch_at DATETIME(3) NULL,
    completed_at DATETIME(3) NULL,
    due_at DATETIME(3) NULL,
    transferred_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_customer_service_tasks_application (application_id),
    KEY idx_customer_service_tasks_assignee_status_due (assignee_user_id, status, due_at),
    KEY idx_customer_service_tasks_status_due (status, due_at),
    CONSTRAINT fk_customer_service_tasks_application FOREIGN KEY (application_id) REFERENCES applications(id),
    CONSTRAINT fk_customer_service_tasks_assignee FOREIGN KEY (assignee_user_id) REFERENCES users(id),
    CONSTRAINT chk_customer_service_tasks_status
      CHECK (status IN ('ASSIGNED', 'PROCESSING', 'WAIT_DISPATCH', 'COMPLETED', 'TRANSFERRED', 'TIMEOUT'))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
  await db.query(`CREATE TABLE IF NOT EXISTS customer_service_task_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    task_id CHAR(36) NOT NULL,
    from_status VARCHAR(32) NULL,
    to_status VARCHAR(32) NOT NULL,
    action_code VARCHAR(64) NOT NULL,
    operator_user_id BIGINT UNSIGNED NULL,
    remark VARCHAR(500) NULL,
    metadata JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_customer_service_task_events_task_time (task_id, created_at),
    KEY idx_customer_service_task_events_operator_time (operator_user_id, created_at),
    CONSTRAINT fk_customer_service_task_events_task FOREIGN KEY (task_id) REFERENCES customer_service_tasks(id),
    CONSTRAINT fk_customer_service_task_events_operator FOREIGN KEY (operator_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
  await db.query("INSERT INTO schema_migrations (version) VALUES ('2026-07-23-add-customer-service-tasks') ON DUPLICATE KEY UPDATE version = VALUES(version)")
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
  await ensureBranchAssignmentModels()
  await salesmanOrganizationPreflight()
  await ensureSalesmanOrganizationV11()
  await ensureLegacyTaskOwnerReconciliation()
  await ensureCanonicalTaskAssignee()
  await ensureCustomerServiceTaskFlow()
  console.log('Database migrations are up to date.')
  await db.end()
}

run().catch(async error => {
  console.error(error)
  try { await db.end() } catch (_) {}
  process.exitCode = 1
})
