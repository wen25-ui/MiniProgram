-- application_tasks 是执行任务事实表；历史两套负责人冲突时保留任务负责人，
-- 并同步 applications 的新旧兼容负责人字段及负责网点。
DELIMITER //
DROP PROCEDURE IF EXISTS canonicalize_task_assignee//
CREATE PROCEDURE canonicalize_task_assignee()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations
     WHERE version = '2026-07-23-canonicalize-task-assignee'
  ) THEN
    UPDATE applications a
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
       );

    INSERT INTO schema_migrations (version)
    VALUES ('2026-07-23-canonicalize-task-assignee')
    ON DUPLICATE KEY UPDATE version = VALUES(version);
  END IF;
END//
CALL canonicalize_task_assignee()//
DROP PROCEDURE canonicalize_task_assignee//
DELIMITER ;
