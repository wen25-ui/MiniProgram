-- 仅创建登录测试账号；所有账号统一密码为 1234（仅保存 SHA-256 哈希）。

INSERT INTO merchants (name, contact_name, contact_phone)
VALUES ('测试合作门店', '测试店长', '13600000001');
SET @merchant_id := LAST_INSERT_ID();

INSERT INTO users (phone, password_hash, display_name, phone_verified_at) VALUES
  ('13600000001', SHA2('1234', 256), '测试店长', NOW(3)),
  ('13800001111', SHA2('1234', 256), '测试业务员', NOW(3)),
  ('13700000001', SHA2('1234', 256), '测试客服', NOW(3)),
  ('13500000001', SHA2('1234', 256), '测试财务', NOW(3)),
  ('13400000001', SHA2('1234', 256), '测试老板', NOW(3)),
  ('13912345678', SHA2('1234', 256), '测试用户一', NOW(3)),
  ('13912345679', SHA2('1234', 256), '测试用户二', NOW(3)),
  ('13912345670', SHA2('1234', 256), '测试用户三', NOW(3));

INSERT INTO users (phone, login_name, password_hash, display_name, account_status)
VALUES (NULL, 'admin', SHA2('1234', 256), '后台管理员', 'ACTIVE')
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), display_name = VALUES(display_name), account_status = 'ACTIVE';

SET @merchant_user_id := (SELECT id FROM users WHERE phone = '13600000001');
SET @salesman_user_id := (SELECT id FROM users WHERE phone = '13800001111');
SET @service_user_id := (SELECT id FROM users WHERE phone = '13700000001');
SET @finance_user_id := (SELECT id FROM users WHERE phone = '13500000001');
SET @boss_user_id := (SELECT id FROM users WHERE phone = '13400000001');
SET @admin_user_id := (SELECT id FROM users WHERE login_name = 'admin');

INSERT INTO user_roles (user_id, role_code, merchant_id, salesman_code) VALUES
  (@merchant_user_id, 'merchant', @merchant_id, NULL),
  (@salesman_user_id, 'salesman', NULL, 's_test_001'),
  (@service_user_id, 'customer-service', NULL, NULL),
  (@finance_user_id, 'finance', NULL, NULL),
  (@boss_user_id, 'boss', NULL, NULL),
  (@admin_user_id, 'admin', NULL, NULL),
  ((SELECT id FROM users WHERE phone = '13912345678'), 'client', NULL, NULL),
  ((SELECT id FROM users WHERE phone = '13912345679'), 'client', NULL, NULL),
  ((SELECT id FROM users WHERE phone = '13912345670'), 'client', NULL, NULL);

INSERT INTO merchant_invites (merchant_id, invite_code, source_type)
VALUES (@merchant_id, 'test-merchant-001', 'merchant_qr');
