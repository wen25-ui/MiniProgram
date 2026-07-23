DELIMITER //
DROP PROCEDURE IF EXISTS migrate_salesman_task_flow//
CREATE PROCEDURE migrate_salesman_task_flow()
BEGIN
IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '2026-07-22-add-salesman-task-flow') THEN

ALTER TABLE user_roles
  ADD COLUMN assigned_merchant_id BIGINT UNSIGNED NULL AFTER merchant_id,
  ADD KEY idx_user_roles_assigned_merchant (assigned_merchant_id),
  ADD CONSTRAINT fk_user_roles_assigned_merchant FOREIGN KEY (assigned_merchant_id) REFERENCES merchants(id);

CREATE TABLE IF NOT EXISTS application_tasks (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS application_task_status_history (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE application_contact_records
  DROP CHECK chk_contact_records_result,
  ADD COLUMN task_id CHAR(36) NULL AFTER application_id,
  ADD COLUMN customer_id BIGINT UNSIGNED NULL AFTER task_id,
  ADD COLUMN contact_method VARCHAR(24) NOT NULL DEFAULT 'PHONE' AFTER operator_user_id,
  ADD COLUMN failure_reason VARCHAR(32) NULL AFTER result,
  ADD COLUMN is_retry TINYINT(1) NOT NULL DEFAULT 0 AFTER remark,
  ADD KEY idx_contact_records_task (task_id, contacted_at),
  ADD CONSTRAINT fk_contact_records_task FOREIGN KEY (task_id) REFERENCES application_tasks(id),
  ADD CONSTRAINT fk_contact_records_customer FOREIGN KEY (customer_id) REFERENCES users(id),
  ADD CONSTRAINT chk_contact_records_result CHECK (result IN ('CONTACTED', 'UNREACHABLE', 'CLIENT_DECLINED', 'CONTACT_SUCCESS', 'CONTACT_FAILED'));

ALTER TABLE fulfillment_submissions
  ADD COLUMN task_id CHAR(36) NULL AFTER id,
  ADD COLUMN result_status VARCHAR(24) NOT NULL DEFAULT 'SUCCESS' AFTER identity_verified,
  ADD COLUMN result_description VARCHAR(1000) NULL AFTER result_status,
  ADD KEY idx_fulfillment_task (task_id, submitted_at),
  ADD CONSTRAINT fk_fulfillment_task FOREIGN KEY (task_id) REFERENCES application_tasks(id),
  ADD CONSTRAINT chk_fulfillment_result_status CHECK (result_status IN ('SUCCESS', 'FAILED'));

INSERT INTO application_tasks (
  id, application_id, service_type, assignee_user_id, store_id, customer_id,
  customer_name, customer_phone, status, appointment_time, started_at,
  result_uploaded_at, completed_at, fail_reason, created_at, updated_at
)
SELECT UUID(), a.id, a.service_mode, a.assigned_salesman_user_id, a.assigned_merchant_id,
       a.client_user_id, u.display_name, a.phone_snapshot,
       CASE a.status
         WHEN 'ASSIGNED' THEN 'PENDING_ACCEPT'
         WHEN 'PROCESSING' THEN 'PROCESSING'
         WHEN 'PENDING_VERIFICATION' THEN 'PENDING_VERIFICATION'
         WHEN 'VERIFICATION_RETURNED' THEN 'WAITING_RESULT_UPLOAD'
         WHEN 'COMPLETED' THEN 'COMPLETED'
         WHEN 'SERVICE_FAILED' THEN 'ABNORMAL_CLOSED'
         ELSE 'PENDING_ACCEPT'
       END,
       a.appointment_time,
       CASE WHEN a.status IN ('PROCESSING','PENDING_VERIFICATION','VERIFICATION_RETURNED','COMPLETED','SERVICE_FAILED') THEN a.updated_at END,
       CASE WHEN a.status IN ('PENDING_VERIFICATION','VERIFICATION_RETURNED','COMPLETED') THEN a.updated_at END,
       CASE WHEN a.status = 'COMPLETED' THEN a.updated_at END,
       a.service_failure_reason, a.created_at, a.updated_at
  FROM applications a
  JOIN users u ON u.id = a.client_user_id
 WHERE a.service_mode IN ('HOME_SERVICE','STORE_SERVICE')
   AND a.status IN ('ASSIGNED','PROCESSING','PENDING_VERIFICATION','VERIFICATION_RETURNED','COMPLETED','SERVICE_FAILED')
ON DUPLICATE KEY UPDATE application_id = VALUES(application_id);

UPDATE fulfillment_submissions f
JOIN application_tasks t ON t.application_id = f.application_id
SET f.task_id = t.id
WHERE f.task_id IS NULL;

INSERT INTO application_task_status_history (task_id, old_status, new_status, operator_role, operation, remark, created_at)
SELECT t.id, NULL, t.status, 'system', 'TASK_BACKFILLED', '由历史订单生成兼容任务', t.created_at
  FROM application_tasks t
 WHERE NOT EXISTS (SELECT 1 FROM application_task_status_history h WHERE h.task_id = t.id);

INSERT INTO schema_migrations (version) VALUES ('2026-07-22-add-salesman-task-flow')
ON DUPLICATE KEY UPDATE version = VALUES(version);

END IF;
END//
CALL migrate_salesman_task_flow()//
DROP PROCEDURE migrate_salesman_task_flow//
DELIMITER ;
