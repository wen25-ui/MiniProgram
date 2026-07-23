-- 纠正历史执行任务已有负责人、但订单新负责人字段为空或网点不一致的兼容数据。
-- 任务 assignee_user_id 是既有执行关系，本迁移不替换任何非空任务负责人。
DELIMITER //
DROP PROCEDURE IF EXISTS reconcile_legacy_task_owners//
CREATE PROCEDURE reconcile_legacy_task_owners()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations
     WHERE version = '2026-07-23-reconcile-legacy-task-owners'
  ) THEN
    UPDATE applications a
    JOIN application_tasks t ON t.application_id = a.id
       SET a.current_salesman_id = t.assignee_user_id,
           a.assigned_salesman_user_id = COALESCE(a.assigned_salesman_user_id, t.assignee_user_id)
     WHERE a.current_salesman_id IS NULL AND t.assignee_user_id IS NOT NULL;

    UPDATE applications a
    JOIN user_roles r ON r.user_id = a.current_salesman_id AND r.role_code = 'salesman'
       SET a.branch_id = r.branch_id
     WHERE a.current_salesman_id IS NOT NULL
       AND r.branch_id IS NOT NULL
       AND NOT (a.branch_id <=> r.branch_id);

    UPDATE application_tasks t
    JOIN user_roles r ON r.user_id = t.assignee_user_id AND r.role_code = 'salesman'
       SET t.branch_id = r.branch_id
     WHERE t.assignee_user_id IS NOT NULL
       AND r.branch_id IS NOT NULL
       AND NOT (t.branch_id <=> r.branch_id);

    UPDATE application_tasks t
    JOIN applications a ON a.id = t.application_id
       SET t.branch_id = a.branch_id
     WHERE t.assignee_user_id IS NULL AND a.branch_id IS NOT NULL
       AND NOT (t.branch_id <=> a.branch_id);

    INSERT INTO schema_migrations (version)
    VALUES ('2026-07-23-reconcile-legacy-task-owners')
    ON DUPLICATE KEY UPDATE version = VALUES(version);
  END IF;
END//
CALL reconcile_legacy_task_owners()//
DROP PROCEDURE reconcile_legacy_task_owners//
DELIMITER ;
