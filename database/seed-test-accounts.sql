-- 全角色登录测试账号。
-- 除管理员外，每个系统角色至少 4 个账号；统一密码：1234。
-- 为保护历史业务外键，不物理删除旧用户，而是停用旧账号并清除登录会话。

START TRANSACTION;

INSERT INTO merchants (name, contact_name, contact_phone, service_region)
SELECT '测试商家一', '商家联系人一', '13610000001', '滨湖区'
WHERE NOT EXISTS (SELECT 1 FROM merchants WHERE name = '测试商家一');
INSERT INTO merchants (name, contact_name, contact_phone, service_region)
SELECT '测试商家二', '商家联系人二', '13610000002', '滨湖区'
WHERE NOT EXISTS (SELECT 1 FROM merchants WHERE name = '测试商家二');
INSERT INTO merchants (name, contact_name, contact_phone, service_region)
SELECT '测试商家三', '商家联系人三', '13610000003', '新吴区'
WHERE NOT EXISTS (SELECT 1 FROM merchants WHERE name = '测试商家三');
INSERT INTO merchants (name, contact_name, contact_phone, service_region)
SELECT '测试商家四', '商家联系人四', '13610000004', '新吴区'
WHERE NOT EXISTS (SELECT 1 FROM merchants WHERE name = '测试商家四');

SET @merchant_1 := (SELECT id FROM merchants WHERE name = '测试商家一' ORDER BY id LIMIT 1);
SET @merchant_2 := (SELECT id FROM merchants WHERE name = '测试商家二' ORDER BY id LIMIT 1);
SET @merchant_3 := (SELECT id FROM merchants WHERE name = '测试商家三' ORDER BY id LIMIT 1);
SET @merchant_4 := (SELECT id FROM merchants WHERE name = '测试商家四' ORDER BY id LIMIT 1);

INSERT INTO users (phone, password_hash, display_name, account_status, phone_verified_at) VALUES
  ('13610000001', SHA2('1234', 256), '测试商家一', 'ACTIVE', NOW(3)),
  ('13610000002', SHA2('1234', 256), '测试商家二', 'ACTIVE', NOW(3)),
  ('13610000003', SHA2('1234', 256), '测试商家三', 'ACTIVE', NOW(3)),
  ('13610000004', SHA2('1234', 256), '测试商家四', 'ACTIVE', NOW(3)),
  ('13810000001', SHA2('1234', 256), '外派业务员一', 'ACTIVE', NOW(3)),
  ('13810000002', SHA2('1234', 256), '外派业务员二', 'ACTIVE', NOW(3)),
  ('13810000003', SHA2('1234', 256), '网点业务员一', 'ACTIVE', NOW(3)),
  ('13810000004', SHA2('1234', 256), '网点业务员二', 'ACTIVE', NOW(3)),
  ('13710000001', SHA2('1234', 256), '测试客服一', 'ACTIVE', NOW(3)),
  ('13710000002', SHA2('1234', 256), '测试客服二', 'ACTIVE', NOW(3)),
  ('13710000003', SHA2('1234', 256), '测试客服三', 'ACTIVE', NOW(3)),
  ('13710000004', SHA2('1234', 256), '测试客服四', 'ACTIVE', NOW(3)),
  ('13510000001', SHA2('1234', 256), '测试财务一', 'ACTIVE', NOW(3)),
  ('13510000002', SHA2('1234', 256), '测试财务二', 'ACTIVE', NOW(3)),
  ('13510000003', SHA2('1234', 256), '测试财务三', 'ACTIVE', NOW(3)),
  ('13510000004', SHA2('1234', 256), '测试财务四', 'ACTIVE', NOW(3)),
  ('13410000001', SHA2('1234', 256), '测试老板一', 'ACTIVE', NOW(3)),
  ('13410000002', SHA2('1234', 256), '测试老板二', 'ACTIVE', NOW(3)),
  ('13410000003', SHA2('1234', 256), '测试老板三', 'ACTIVE', NOW(3)),
  ('13410000004', SHA2('1234', 256), '测试老板四', 'ACTIVE', NOW(3)),
  ('13910000001', SHA2('1234', 256), '测试客户一', 'ACTIVE', NOW(3)),
  ('13910000002', SHA2('1234', 256), '测试客户二', 'ACTIVE', NOW(3)),
  ('13910000003', SHA2('1234', 256), '测试客户三', 'ACTIVE', NOW(3)),
  ('13910000004', SHA2('1234', 256), '测试客户四', 'ACTIVE', NOW(3))
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), display_name = VALUES(display_name),
  account_status = 'ACTIVE', phone_verified_at = VALUES(phone_verified_at);

-- 保留管理员；停用不在本测试账号集内的原有账号。
UPDATE users
   SET account_status = 'DISABLED'
 WHERE login_name IS NULL
   AND phone NOT IN (
    '13610000001','13610000002','13610000003','13610000004',
    '13810000001','13810000002','13810000003','13810000004',
    '13710000001','13710000002','13710000003','13710000004',
    '13510000001','13510000002','13510000003','13510000004',
    '13410000001','13410000002','13410000003','13410000004',
    '13910000001','13910000002','13910000003','13910000004'
  );

DELETE s FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE u.login_name IS NULL;

DELETE ur FROM user_roles ur JOIN users u ON u.id = ur.user_id
 WHERE u.phone IN (
  '13610000001','13610000002','13610000003','13610000004',
  '13810000001','13810000002','13810000003','13810000004',
  '13710000001','13710000002','13710000003','13710000004',
  '13510000001','13510000002','13510000003','13510000004',
  '13410000001','13410000002','13410000003','13410000004',
  '13910000001','13910000002','13910000003','13910000004'
 );

INSERT INTO user_roles (user_id, role_code, merchant_id) VALUES
  ((SELECT id FROM users WHERE phone = '13610000001'), 'merchant', @merchant_1),
  ((SELECT id FROM users WHERE phone = '13610000002'), 'merchant', @merchant_2),
  ((SELECT id FROM users WHERE phone = '13610000003'), 'merchant', @merchant_3),
  ((SELECT id FROM users WHERE phone = '13610000004'), 'merchant', @merchant_4);

INSERT INTO user_roles (user_id, role_code, salesman_code, salesman_type, service_region, assigned_merchant_id) VALUES
  ((SELECT id FROM users WHERE phone = '13810000001'), 'salesman', 'S-TEST-001', 'HOME_VISIT', '滨湖区', NULL),
  ((SELECT id FROM users WHERE phone = '13810000002'), 'salesman', 'S-TEST-002', 'HOME_VISIT', '新吴区', NULL),
  ((SELECT id FROM users WHERE phone = '13810000003'), 'salesman', 'S-TEST-003', 'BRANCH', NULL, @merchant_1),
  ((SELECT id FROM users WHERE phone = '13810000004'), 'salesman', 'S-TEST-004', 'BRANCH', NULL, @merchant_3);

INSERT INTO user_roles (user_id, role_code) VALUES
  ((SELECT id FROM users WHERE phone = '13710000001'), 'customer-service'),
  ((SELECT id FROM users WHERE phone = '13710000002'), 'customer-service'),
  ((SELECT id FROM users WHERE phone = '13710000003'), 'customer-service'),
  ((SELECT id FROM users WHERE phone = '13710000004'), 'customer-service'),
  ((SELECT id FROM users WHERE phone = '13510000001'), 'finance'),
  ((SELECT id FROM users WHERE phone = '13510000002'), 'finance'),
  ((SELECT id FROM users WHERE phone = '13510000003'), 'finance'),
  ((SELECT id FROM users WHERE phone = '13510000004'), 'finance'),
  ((SELECT id FROM users WHERE phone = '13410000001'), 'boss'),
  ((SELECT id FROM users WHERE phone = '13410000002'), 'boss'),
  ((SELECT id FROM users WHERE phone = '13410000003'), 'boss'),
  ((SELECT id FROM users WHERE phone = '13410000004'), 'boss'),
  ((SELECT id FROM users WHERE phone = '13910000001'), 'client'),
  ((SELECT id FROM users WHERE phone = '13910000002'), 'client'),
  ((SELECT id FROM users WHERE phone = '13910000003'), 'client'),
  ((SELECT id FROM users WHERE phone = '13910000004'), 'client');

INSERT INTO merchant_invites (merchant_id, invite_code, source_type, status)
VALUES
  (@merchant_1, 'test-merchant-001', 'merchant_qr', 'ACTIVE'),
  (@merchant_2, 'test-merchant-002', 'merchant_qr', 'ACTIVE'),
  (@merchant_3, 'test-merchant-003', 'merchant_qr', 'ACTIVE'),
  (@merchant_4, 'test-merchant-004', 'merchant_qr', 'ACTIVE')
ON DUPLICATE KEY UPDATE merchant_id = VALUES(merchant_id), status = 'ACTIVE';

COMMIT;

-- 验证：除管理员外，每个角色应至少返回 4 个启用账号。
SELECT ur.role_code, COUNT(*) AS active_account_count
  FROM user_roles ur JOIN users u ON u.id = ur.user_id
 WHERE u.account_status = 'ACTIVE' AND ur.role_code <> 'admin'
 GROUP BY ur.role_code ORDER BY ur.role_code;
