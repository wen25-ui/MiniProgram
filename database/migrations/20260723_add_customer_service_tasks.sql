-- 客服个人任务与状态事件。与派遣后的 application_tasks 分离。
DELIMITER //
DROP PROCEDURE IF EXISTS migrate_customer_service_tasks//
CREATE PROCEDURE migrate_customer_service_tasks()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations
     WHERE version = '2026-07-23-add-customer-service-tasks'
  ) THEN
    CREATE TABLE IF NOT EXISTS customer_service_tasks (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

    CREATE TABLE IF NOT EXISTS customer_service_task_events (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

    INSERT INTO schema_migrations (version)
    VALUES ('2026-07-23-add-customer-service-tasks')
    ON DUPLICATE KEY UPDATE version = VALUES(version);
  END IF;
END//
CALL migrate_customer_service_tasks()//
DROP PROCEDURE migrate_customer_service_tasks//
DELIMITER ;
