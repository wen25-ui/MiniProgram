-- 业务员组织模型 V1.1：branches 为唯一网点实体，branch_id 为人员及任务主归属字段。
-- salesman_type 保留为历史兼容字段，但不再参与新业务授权。
DELIMITER //
DROP PROCEDURE IF EXISTS migrate_salesman_branch_capability_v11//
CREATE PROCEDURE migrate_salesman_branch_capability_v11()
BEGIN
  DECLARE unmapped_salesmen INT DEFAULT 0;
  DECLARE unmapped_tasks INT DEFAULT 0;

  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations
     WHERE version = '2026-07-23-unify-salesman-branch-capability-v11'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_roles'
         AND COLUMN_NAME = 'can_field_service'
    ) THEN
      ALTER TABLE user_roles
        ADD COLUMN can_field_service TINYINT(1) NOT NULL DEFAULT 0 AFTER salesman_type;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'user_roles'
         AND CONSTRAINT_NAME = 'chk_user_roles_can_field_service'
    ) THEN
      ALTER TABLE user_roles
        ADD CONSTRAINT chk_user_roles_can_field_service CHECK (can_field_service IN (0, 1));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_roles'
         AND INDEX_NAME = 'idx_user_roles_salesman_branch_capability'
    ) THEN
      CREATE INDEX idx_user_roles_salesman_branch_capability
        ON user_roles (role_code, branch_id, can_field_service, user_id);
    END IF;

    -- 历史 merchant 曾兼作办理网点；仅在 merchant 尚无 branch 时补建同名默认网点。
    INSERT INTO branches (
      merchant_id, name, contact_name, contact_phone, status, created_at, updated_at
    )
    SELECT m.id, m.name, m.contact_name, m.contact_phone, m.status, m.created_at, m.updated_at
      FROM merchants m
     WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.merchant_id = m.id);

    -- 优先使用已有明确 merchant 归属；多网点时只接受同名默认网点或唯一有效网点。
    UPDATE user_roles r
    JOIN branches b ON b.merchant_id = r.assigned_merchant_id
                   AND b.status = 'ACTIVE'
    JOIN merchants m ON m.id = r.assigned_merchant_id AND b.name = m.name
       SET r.branch_id = b.id
     WHERE r.role_code = 'salesman' AND r.branch_id IS NULL;

    UPDATE user_roles r
    JOIN (
      SELECT merchant_id, MIN(id) AS branch_id
        FROM branches
       WHERE status = 'ACTIVE'
       GROUP BY merchant_id
      HAVING COUNT(*) = 1
    ) candidate ON candidate.merchant_id = r.assigned_merchant_id
       SET r.branch_id = candidate.branch_id
     WHERE r.role_code = 'salesman' AND r.branch_id IS NULL;

    -- 原 HOME_VISIT 人员只能按唯一行政区或唯一历史服务地域映射，禁止任取第一网点。
    UPDATE user_roles r
    JOIN (
      SELECT m.area_id, MIN(b.id) AS branch_id
        FROM branches b JOIN merchants m ON m.id = b.merchant_id
       WHERE b.status = 'ACTIVE' AND m.status = 'ACTIVE' AND m.area_id IS NOT NULL
       GROUP BY m.area_id
      HAVING COUNT(*) = 1
    ) candidate ON candidate.area_id = r.area_id
       SET r.branch_id = candidate.branch_id
     WHERE r.role_code = 'salesman' AND r.branch_id IS NULL;

    UPDATE user_roles r
    JOIN (
      SELECT m.service_region, MIN(b.id) AS branch_id
        FROM branches b JOIN merchants m ON m.id = b.merchant_id
       WHERE b.status = 'ACTIVE' AND m.status = 'ACTIVE'
         AND m.service_region IS NOT NULL AND m.service_region <> ''
       GROUP BY m.service_region
      HAVING COUNT(*) = 1
    ) candidate ON candidate.service_region = r.service_region
       SET r.branch_id = candidate.branch_id
     WHERE r.role_code = 'salesman' AND r.branch_id IS NULL;

    UPDATE user_roles
       SET can_field_service = CASE WHEN salesman_type = 'HOME_VISIT' THEN 1 ELSE 0 END
     WHERE role_code = 'salesman';

    SELECT COUNT(*) INTO unmapped_salesmen
      FROM user_roles r
      JOIN users u ON u.id = r.user_id AND u.account_status = 'ACTIVE'
      LEFT JOIN branches b ON b.id = r.branch_id AND b.status = 'ACTIVE'
     WHERE r.role_code = 'salesman' AND b.id IS NULL;
    IF unmapped_salesmen > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = '存在无法唯一映射到有效网点的 ACTIVE 业务员；迁移已中止，请先查看预检报告';
    END IF;

    -- 订单先从旧 merchant、当前负责人或唯一行政区回填负责网点。
    UPDATE applications a
    JOIN (
      SELECT merchant_id, MIN(id) AS branch_id
        FROM branches
       GROUP BY merchant_id
      HAVING COUNT(*) = 1
    ) candidate ON candidate.merchant_id = a.assigned_merchant_id
       SET a.branch_id = candidate.branch_id
     WHERE a.branch_id IS NULL;

    UPDATE applications a
    JOIN user_roles r ON r.user_id = COALESCE(a.current_salesman_id, a.assigned_salesman_user_id)
                     AND r.role_code = 'salesman'
       SET a.branch_id = r.branch_id
     WHERE a.branch_id IS NULL AND r.branch_id IS NOT NULL;

    UPDATE applications a
    JOIN (
      SELECT m.area_id, MIN(b.id) AS branch_id
        FROM branches b JOIN merchants m ON m.id = b.merchant_id
       WHERE b.status = 'ACTIVE' AND m.status = 'ACTIVE' AND m.area_id IS NOT NULL
       GROUP BY m.area_id
      HAVING COUNT(*) = 1
    ) candidate ON candidate.area_id = a.district_area_id
       SET a.branch_id = candidate.branch_id
     WHERE a.branch_id IS NULL;

    UPDATE applications
       SET current_salesman_id = assigned_salesman_user_id
     WHERE current_salesman_id IS NULL AND assigned_salesman_user_id IS NOT NULL;

    UPDATE application_tasks t
    JOIN applications a ON a.id = t.application_id
       SET t.branch_id = a.branch_id
     WHERE t.branch_id IS NULL AND a.branch_id IS NOT NULL;

    UPDATE application_tasks t
    JOIN user_roles r ON r.user_id = t.assignee_user_id AND r.role_code = 'salesman'
       SET t.branch_id = r.branch_id
     WHERE t.branch_id IS NULL AND r.branch_id IS NOT NULL;

    UPDATE applications a
    JOIN application_tasks t ON t.application_id = a.id
       SET a.branch_id = t.branch_id
     WHERE a.branch_id IS NULL AND t.branch_id IS NOT NULL;

    SELECT COUNT(*) INTO unmapped_tasks
      FROM application_tasks
     WHERE branch_id IS NULL;
    IF unmapped_tasks > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = '存在无法确定负责网点的历史执行任务；迁移已中止，请先查看预检报告';
    END IF;

    ALTER TABLE application_tasks MODIFY branch_id BIGINT UNSIGNED NOT NULL;

    INSERT INTO schema_migrations (version)
    VALUES ('2026-07-23-unify-salesman-branch-capability-v11')
    ON DUPLICATE KEY UPDATE version = VALUES(version);
  END IF;
END//
CALL migrate_salesman_branch_capability_v11()//
DROP PROCEDURE migrate_salesman_branch_capability_v11//
DELIMITER ;
