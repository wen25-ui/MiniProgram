-- 网点组织、订单分配、动态审核及客服内部数据模型。
-- applications 是现有订单主表，user_roles(role_code='salesman') 是现有业务员模型。
DELIMITER //
DROP PROCEDURE IF EXISTS migrate_branch_and_assignment_models//
CREATE PROCEDURE migrate_branch_and_assignment_models()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations
     WHERE version = '2026-07-23-add-branch-and-assignment-models'
  ) THEN

    CREATE TABLE IF NOT EXISTS branches (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_roles' AND COLUMN_NAME = 'branch_id'
    ) THEN
      ALTER TABLE user_roles ADD COLUMN branch_id BIGINT UNSIGNED NULL AFTER assigned_merchant_id;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_roles' AND INDEX_NAME = 'idx_user_roles_salesman_branch'
    ) THEN
      CREATE INDEX idx_user_roles_salesman_branch ON user_roles (role_code, branch_id, user_id);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'user_roles' AND CONSTRAINT_NAME = 'fk_user_roles_branch'
    ) THEN
      ALTER TABLE user_roles
        ADD CONSTRAINT fk_user_roles_branch FOREIGN KEY (branch_id) REFERENCES branches(id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'branch_id'
    ) THEN
      ALTER TABLE applications ADD COLUMN branch_id BIGINT UNSIGNED NULL AFTER assigned_merchant_id;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'current_salesman_id'
    ) THEN
      ALTER TABLE applications ADD COLUMN current_salesman_id BIGINT UNSIGNED NULL AFTER branch_id;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'assign_type'
    ) THEN
      ALTER TABLE applications ADD COLUMN assign_type VARCHAR(32) NULL AFTER current_salesman_id;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND INDEX_NAME = 'idx_applications_branch_status'
    ) THEN
      CREATE INDEX idx_applications_branch_status ON applications (branch_id, status, updated_at);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND INDEX_NAME = 'idx_applications_current_salesman_status'
    ) THEN
      CREATE INDEX idx_applications_current_salesman_status ON applications (current_salesman_id, status, updated_at);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND CONSTRAINT_NAME = 'fk_applications_branch'
    ) THEN
      ALTER TABLE applications
        ADD CONSTRAINT fk_applications_branch FOREIGN KEY (branch_id) REFERENCES branches(id);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND CONSTRAINT_NAME = 'fk_applications_current_salesman'
    ) THEN
      ALTER TABLE applications
        ADD CONSTRAINT fk_applications_current_salesman FOREIGN KEY (current_salesman_id) REFERENCES users(id);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND CONSTRAINT_NAME = 'chk_applications_assign_type'
    ) THEN
      ALTER TABLE applications ADD CONSTRAINT chk_applications_assign_type
        CHECK (assign_type IS NULL OR assign_type IN ('BRANCH_ASSIGN', 'SALESMAN_GRAB', 'TRANSFER'));
    END IF;

    -- 执行任务表保留现有 assignee_user_id；补充网点任务池字段，便于网点内查询和原子抢单。
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_tasks' AND COLUMN_NAME = 'branch_id'
    ) THEN
      ALTER TABLE application_tasks ADD COLUMN branch_id BIGINT UNSIGNED NULL AFTER store_id;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_tasks' AND COLUMN_NAME = 'assign_type'
    ) THEN
      ALTER TABLE application_tasks ADD COLUMN assign_type VARCHAR(32) NULL AFTER branch_id;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_tasks' AND INDEX_NAME = 'idx_application_tasks_branch_pool'
    ) THEN
      CREATE INDEX idx_application_tasks_branch_pool
        ON application_tasks (branch_id, assignee_user_id, status, updated_at);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'application_tasks' AND CONSTRAINT_NAME = 'fk_application_tasks_branch'
    ) THEN
      ALTER TABLE application_tasks
        ADD CONSTRAINT fk_application_tasks_branch FOREIGN KEY (branch_id) REFERENCES branches(id);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'application_tasks' AND CONSTRAINT_NAME = 'chk_application_tasks_assign_type'
    ) THEN
      ALTER TABLE application_tasks ADD CONSTRAINT chk_application_tasks_assign_type
        CHECK (assign_type IS NULL OR assign_type IN ('BRANCH_ASSIGN', 'SALESMAN_GRAB', 'TRANSFER'));
    END IF;

    CREATE TABLE IF NOT EXISTS order_assignments (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

    CREATE TABLE IF NOT EXISTS order_transfer_logs (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

    CREATE TABLE IF NOT EXISTS order_grab_records (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_id CHAR(36) NOT NULL,
      salesman_id BIGINT UNSIGNED NOT NULL,
      grab_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      result VARCHAR(32) NOT NULL,
      KEY idx_order_grab_records_order (order_id, grab_time),
      KEY idx_order_grab_records_salesman (salesman_id, grab_time),
      CONSTRAINT fk_order_grab_records_order FOREIGN KEY (order_id) REFERENCES applications(id),
      CONSTRAINT fk_order_grab_records_salesman FOREIGN KEY (salesman_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

    CREATE TABLE IF NOT EXISTS review_questions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      type VARCHAR(32) NOT NULL,
      parent_id BIGINT UNSIGNED NULL,
      parent_answer VARCHAR(500) NULL,
      `sort` INT NOT NULL DEFAULT 0,
      status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
      KEY idx_review_questions_parent_sort (parent_id, `sort`),
      KEY idx_review_questions_status_sort (status, `sort`),
      CONSTRAINT fk_review_questions_parent FOREIGN KEY (parent_id) REFERENCES review_questions(id),
      CONSTRAINT chk_review_questions_status CHECK (status IN ('ACTIVE', 'DISABLED'))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

    CREATE TABLE IF NOT EXISTS review_answers (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

    CREATE TABLE IF NOT EXISTS customer_internal_tags (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      customer_id BIGINT UNSIGNED NOT NULL,
      tag VARCHAR(80) NOT NULL,
      operator_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uk_customer_internal_tags_customer_tag (customer_id, tag),
      KEY idx_customer_internal_tags_customer (customer_id, created_at),
      CONSTRAINT fk_customer_internal_tags_customer FOREIGN KEY (customer_id) REFERENCES users(id),
      CONSTRAINT fk_customer_internal_tags_operator FOREIGN KEY (operator_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

    CREATE TABLE IF NOT EXISTS customer_internal_notes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      customer_id BIGINT UNSIGNED NOT NULL,
      content TEXT NOT NULL,
      operator_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_customer_internal_notes_customer (customer_id, created_at),
      CONSTRAINT fk_customer_internal_notes_customer FOREIGN KEY (customer_id) REFERENCES users(id),
      CONSTRAINT fk_customer_internal_notes_operator FOREIGN KEY (operator_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

    -- 历史 merchants 曾兼作网点；为每个历史 merchant 建立同名默认网点，不删除旧关联。
    INSERT INTO branches (
      merchant_id, name, address, contact_name, contact_phone, status, created_at, updated_at
    )
    SELECT m.id, m.name, NULL, m.contact_name, m.contact_phone, m.status, m.created_at, m.updated_at
      FROM merchants m
     WHERE NOT EXISTS (
       SELECT 1 FROM branches b WHERE b.merchant_id = m.id AND b.name = m.name
     );

    UPDATE user_roles r
    JOIN merchants m ON m.id = r.assigned_merchant_id
    JOIN branches b ON b.merchant_id = m.id AND b.name = m.name
       SET r.branch_id = b.id
     WHERE r.role_code = 'salesman' AND r.branch_id IS NULL;

    UPDATE applications a
    JOIN merchants m ON m.id = a.assigned_merchant_id
    JOIN branches b ON b.merchant_id = m.id AND b.name = m.name
       SET a.branch_id = b.id
     WHERE a.branch_id IS NULL;

    UPDATE applications
       SET current_salesman_id = assigned_salesman_user_id
     WHERE current_salesman_id IS NULL AND assigned_salesman_user_id IS NOT NULL;

    UPDATE applications
       SET assign_type = 'BRANCH_ASSIGN'
     WHERE assign_type IS NULL AND (branch_id IS NOT NULL OR current_salesman_id IS NOT NULL);

    UPDATE application_tasks t
    JOIN applications a ON a.id = t.application_id
       SET t.branch_id = a.branch_id,
           t.assign_type = COALESCE(a.assign_type, 'BRANCH_ASSIGN')
     WHERE t.branch_id IS NULL OR t.assign_type IS NULL;

    INSERT INTO order_assignments (
      order_id, branch_id, salesman_id, assign_type, operator_id, created_at
    )
    SELECT a.id, a.branch_id, a.current_salesman_id,
           COALESCE(a.assign_type, 'BRANCH_ASSIGN'),
           (SELECT d.dispatcher_user_id
              FROM application_dispatches d
             WHERE d.application_id = a.id
             ORDER BY d.created_at DESC, d.id DESC LIMIT 1),
           a.updated_at
      FROM applications a
     WHERE (a.branch_id IS NOT NULL OR a.current_salesman_id IS NOT NULL)
       AND NOT EXISTS (
         SELECT 1 FROM order_assignments oa WHERE oa.order_id = a.id
       );

    INSERT INTO schema_migrations (version)
    VALUES ('2026-07-23-add-branch-and-assignment-models')
    ON DUPLICATE KEY UPDATE version = VALUES(version);

  END IF;
END//
CALL migrate_branch_and_assignment_models()//
DROP PROCEDURE migrate_branch_and_assignment_models//
DELIMITER ;
