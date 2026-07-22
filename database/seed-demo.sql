-- 演示数据：可重复执行，不会删除或覆盖真实业务数据。

INSERT INTO merchants (name, contact_name, contact_phone)
SELECT '演示合作门店', '李店长', '13600000001'
WHERE NOT EXISTS (SELECT 1 FROM merchants WHERE name = '演示合作门店');
SET @merchant_id := (SELECT id FROM merchants WHERE name = '演示合作门店' ORDER BY id LIMIT 1);

INSERT INTO users (phone, display_name, phone_verified_at) VALUES
  ('13600000001', '李店长', NOW(3)),
  ('13800001111', '张业务', NOW(3)),
  ('13700000001', '王客服', NOW(3)),
  ('13500000001', '赵财务', NOW(3)),
  ('13400000001', '陈老板', NOW(3)),
  ('13912345678', '赵先生', NOW(3)),
  ('13912345679', '陈女士', NOW(3)),
  ('13912345670', '孙先生', NOW(3)),
  ('13912345671', '周女士', NOW(3)),
  ('13912345672', '吴先生', NOW(3)),
  ('13912345673', '郑女士', NOW(3))
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

INSERT INTO users (phone, login_name, display_name, password_hash, account_status)
VALUES (NULL, 'admin', '后台管理员', SHA2('1234', 256), 'ACTIVE')
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), password_hash = VALUES(password_hash), account_status = 'ACTIVE';

-- 所有演示账号使用同一测试密码 1234；数据库只保存 SHA-256 哈希。
UPDATE users SET password_hash = SHA2('1234', 256)
WHERE phone IN ('13600000001', '13800001111', '13700000001', '13500000001', '13400000001', '13912345678', '13912345679', '13912345670', '13912345671', '13912345672', '13912345673');

SET @merchant_user_id := (SELECT id FROM users WHERE phone = '13600000001');
SET @salesman_user_id := (SELECT id FROM users WHERE phone = '13800001111');
SET @service_user_id := (SELECT id FROM users WHERE phone = '13700000001');
SET @finance_user_id := (SELECT id FROM users WHERE phone = '13500000001');
SET @boss_user_id := (SELECT id FROM users WHERE phone = '13400000001');
SET @admin_user_id := (SELECT id FROM users WHERE login_name = 'admin');
SET @client_review_id := (SELECT id FROM users WHERE phone = '13912345678');
SET @client_dispatch_id := (SELECT id FROM users WHERE phone = '13912345679');
SET @client_service_id := (SELECT id FROM users WHERE phone = '13912345670');
SET @client_verify_id := (SELECT id FROM users WHERE phone = '13912345671');
SET @client_completed_id := (SELECT id FROM users WHERE phone = '13912345672');
SET @client_posted_id := (SELECT id FROM users WHERE phone = '13912345673');

INSERT INTO user_roles (user_id, role_code, merchant_id, salesman_code) VALUES
  (@merchant_user_id, 'merchant', @merchant_id, NULL),
  (@salesman_user_id, 'salesman', NULL, 's_demo_001'),
  (@service_user_id, 'customer-service', NULL, NULL),
  (@finance_user_id, 'finance', NULL, NULL),
  (@boss_user_id, 'boss', NULL, NULL),
  (@admin_user_id, 'admin', NULL, NULL),
  (@client_review_id, 'client', NULL, NULL),
  (@client_dispatch_id, 'client', NULL, NULL),
  (@client_service_id, 'client', NULL, NULL),
  (@client_verify_id, 'client', NULL, NULL),
  (@client_completed_id, 'client', NULL, NULL),
  (@client_posted_id, 'client', NULL, NULL)
ON DUPLICATE KEY UPDATE merchant_id = VALUES(merchant_id), salesman_code = VALUES(salesman_code);

INSERT INTO merchant_invites (merchant_id, invite_code, source_type)
VALUES (@merchant_id, 'demo-merchant-001', 'merchant_qr')
ON DUPLICATE KEY UPDATE merchant_id = VALUES(merchant_id), status = 'ACTIVE';
SET @invite_id := (SELECT id FROM merchant_invites WHERE invite_code = 'demo-merchant-001');

INSERT INTO applications (
  id, client_user_id, merchant_id, merchant_invite_id, source_type, phone_snapshot,
  attribution_status, attribution_province, attribution_city, local_option, expense_tier,
  commitments, pre_screen_passed, pre_screen_status, rule_version, status, screening_submitted_at
)
SELECT '10000000-0000-4000-8000-000000000001', @client_review_id, @merchant_id, @invite_id, 'merchant_qr', '13912345678',
  'QUERY_SUCCESS', '广东省', '深圳市', 'LOCAL_RESIDENT', 'FROM_250', JSON_ARRAY(true, true, true, true), 1, 'PENDING', 'demo-v1', 'PENDING', NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM applications WHERE id = '10000000-0000-4000-8000-000000000001');

INSERT INTO applications (
  id, client_user_id, merchant_id, merchant_invite_id, source_type, phone_snapshot,
  attribution_status, attribution_province, attribution_city, local_option, expense_tier,
  commitments, pre_screen_passed, pre_screen_status, rule_version, status, service_mode, appointment_time, screening_submitted_at
)
SELECT '10000000-0000-4000-8000-000000000002', @client_dispatch_id, @merchant_id, @invite_id, 'merchant_qr', '13912345679',
  'QUERY_SUCCESS', '广东省', '深圳市', 'LOCAL_NUMBER', 'FROM_400', JSON_ARRAY(true, true, true, true), 1, 'PENDING', 'demo-v1', 'CONFIRMED', 'HOME_SERVICE', '2026-07-21 10:00:00', NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM applications WHERE id = '10000000-0000-4000-8000-000000000002');

INSERT INTO applications (
  id, client_user_id, merchant_id, merchant_invite_id, source_type, phone_snapshot,
  attribution_status, attribution_province, attribution_city, local_option, expense_tier,
  commitments, pre_screen_passed, pre_screen_status, rule_version, status, service_mode, appointment_time, assigned_salesman_user_id, screening_submitted_at
)
SELECT '10000000-0000-4000-8000-000000000003', @client_service_id, @merchant_id, @invite_id, 'merchant_qr', '13912345670',
  'QUERY_SUCCESS', '广东省', '深圳市', 'ACCEPT_LOCAL_CARD', 'FROM_150', JSON_ARRAY(true, true, true, true), 1, 'PENDING', 'demo-v1', 'ASSIGNED', 'HOME_SERVICE', '2026-07-21 14:00:00', @salesman_user_id, NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM applications WHERE id = '10000000-0000-4000-8000-000000000003');

INSERT INTO applications (
  id, client_user_id, merchant_id, merchant_invite_id, source_type, phone_snapshot,
  attribution_status, attribution_province, attribution_city, local_option, expense_tier,
  commitments, pre_screen_passed, pre_screen_status, rule_version, status, service_mode, appointment_time, assigned_salesman_user_id, screening_submitted_at
)
SELECT '10000000-0000-4000-8000-000000000004', @client_verify_id, @merchant_id, @invite_id, 'merchant_qr', '13912345671',
  'QUERY_SUCCESS', '广东省', '深圳市', 'LOCAL_RESIDENT', 'FROM_250', JSON_ARRAY(true, true, true, true), 1, 'PENDING', 'demo-v1', 'PENDING_VERIFICATION', 'HOME_SERVICE', '2026-07-20 15:00:00', @salesman_user_id, NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM applications WHERE id = '10000000-0000-4000-8000-000000000004');

INSERT INTO applications (
  id, client_user_id, merchant_id, merchant_invite_id, source_type, phone_snapshot,
  attribution_status, attribution_province, attribution_city, local_option, expense_tier,
  commitments, pre_screen_passed, pre_screen_status, rule_version, status, service_mode, appointment_time, assigned_salesman_user_id, refund_status, screening_submitted_at
)
SELECT '10000000-0000-4000-8000-000000000005', @client_completed_id, @merchant_id, @invite_id, 'merchant_qr', '13912345672',
  'QUERY_SUCCESS', '广东省', '深圳市', 'LOCAL_NUMBER', 'FROM_400', JSON_ARRAY(true, true, true, true), 1, 'PENDING', 'demo-v1', 'COMPLETED', 'HOME_SERVICE', '2026-07-19 10:00:00', @salesman_user_id, 'PENDING_CONFIRMATION', NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM applications WHERE id = '10000000-0000-4000-8000-000000000005');

INSERT INTO applications (
  id, client_user_id, merchant_id, merchant_invite_id, source_type, phone_snapshot,
  attribution_status, attribution_province, attribution_city, local_option, expense_tier,
  commitments, pre_screen_passed, pre_screen_status, rule_version, status, service_mode, appointment_time, assigned_salesman_user_id, expected_refund_amount, refund_status, screening_submitted_at
)
SELECT '10000000-0000-4000-8000-000000000006', @client_posted_id, @merchant_id, @invite_id, 'merchant_qr', '13912345673',
  'QUERY_SUCCESS', '广东省', '深圳市', 'LOCAL_RESIDENT', 'FROM_400', JSON_ARRAY(true, true, true, true), 1, 'PENDING', 'demo-v1', 'COMPLETED', 'HOME_SERVICE', '2026-07-18 14:00:00', @salesman_user_id, 800.00, 'REFUND_POSTED', NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM applications WHERE id = '10000000-0000-4000-8000-000000000006');

INSERT INTO application_status_history (application_id, to_status, action_code, operator_user_id, operator_role)
SELECT '10000000-0000-4000-8000-000000000001', 'PENDING', 'PRE_SCREEN_PASSED', NULL, 'system'
WHERE NOT EXISTS (SELECT 1 FROM application_status_history WHERE application_id = '10000000-0000-4000-8000-000000000001' AND action_code = 'PRE_SCREEN_PASSED');

INSERT INTO application_status_history (application_id, to_status, action_code, operator_user_id, operator_role)
SELECT '10000000-0000-4000-8000-000000000002', 'CONFIRMED', 'SERVICE_TYPE_CONFIRMED', @service_user_id, 'customer-service'
WHERE NOT EXISTS (SELECT 1 FROM application_status_history WHERE application_id = '10000000-0000-4000-8000-000000000002' AND action_code = 'APPOINTMENT_CONFIRMED');

INSERT INTO application_status_history (application_id, to_status, action_code, operator_user_id, operator_role)
SELECT '10000000-0000-4000-8000-000000000003', 'ASSIGNED', 'DISPATCHED', @service_user_id, 'customer-service'
WHERE NOT EXISTS (SELECT 1 FROM application_status_history WHERE application_id = '10000000-0000-4000-8000-000000000003' AND action_code = 'DISPATCHED');

INSERT INTO application_status_history (application_id, to_status, action_code, operator_user_id, operator_role)
SELECT '10000000-0000-4000-8000-000000000004', 'PENDING_VERIFICATION', 'FULFILLMENT_SUBMITTED', @salesman_user_id, 'salesman'
WHERE NOT EXISTS (SELECT 1 FROM application_status_history WHERE application_id = '10000000-0000-4000-8000-000000000004' AND action_code = 'FULFILLMENT_SUBMITTED');

INSERT INTO application_status_history (application_id, to_status, action_code, operator_user_id, operator_role)
SELECT '10000000-0000-4000-8000-000000000005', 'COMPLETED', 'FULFILLMENT_VERIFIED', @service_user_id, 'customer-service'
WHERE NOT EXISTS (SELECT 1 FROM application_status_history WHERE application_id = '10000000-0000-4000-8000-000000000005' AND action_code = 'FULFILLMENT_VERIFIED');

INSERT INTO application_status_history (application_id, to_status, action_code, operator_user_id, operator_role)
SELECT '10000000-0000-4000-8000-000000000006', 'COMPLETED', 'REFUND_POSTED', @finance_user_id, 'finance'
WHERE NOT EXISTS (SELECT 1 FROM application_status_history WHERE application_id = '10000000-0000-4000-8000-000000000006' AND action_code = 'REFUND_POSTED');

INSERT INTO application_reviews (application_id, reviewer_user_id, decision, reason)
SELECT app_id, @service_user_id, 'APPROVE', '演示审核通过'
FROM (
  SELECT '10000000-0000-4000-8000-000000000002' AS app_id UNION ALL
  SELECT '10000000-0000-4000-8000-000000000003' UNION ALL
  SELECT '10000000-0000-4000-8000-000000000004' UNION ALL
  SELECT '10000000-0000-4000-8000-000000000005' UNION ALL
  SELECT '10000000-0000-4000-8000-000000000006'
) AS demo_reviews
WHERE NOT EXISTS (SELECT 1 FROM application_reviews r WHERE r.application_id = demo_reviews.app_id AND r.decision = 'APPROVE');

INSERT INTO application_appointments (application_id, appointment_time, confirmed_by_user_id, note)
SELECT app_id, appointment_time, @service_user_id, '演示预约'
FROM (
  SELECT '10000000-0000-4000-8000-000000000002' AS app_id, CAST('2026-07-21 10:00:00' AS DATETIME) AS appointment_time UNION ALL
  SELECT '10000000-0000-4000-8000-000000000003', CAST('2026-07-21 14:00:00' AS DATETIME) UNION ALL
  SELECT '10000000-0000-4000-8000-000000000004', CAST('2026-07-20 15:00:00' AS DATETIME) UNION ALL
  SELECT '10000000-0000-4000-8000-000000000005', CAST('2026-07-19 10:00:00' AS DATETIME) UNION ALL
  SELECT '10000000-0000-4000-8000-000000000006', CAST('2026-07-18 14:00:00' AS DATETIME)
) AS demo_appointments
WHERE NOT EXISTS (SELECT 1 FROM application_appointments a WHERE a.application_id = demo_appointments.app_id AND a.status = 'CONFIRMED');

INSERT INTO application_dispatches (application_id, salesman_user_id, dispatcher_user_id, status, note)
SELECT app_id, @salesman_user_id, @service_user_id, 'ASSIGNED', '演示派单'
FROM (
  SELECT '10000000-0000-4000-8000-000000000003' AS app_id UNION ALL
  SELECT '10000000-0000-4000-8000-000000000004' UNION ALL
  SELECT '10000000-0000-4000-8000-000000000005' UNION ALL
  SELECT '10000000-0000-4000-8000-000000000006'
) AS demo_dispatches
WHERE NOT EXISTS (SELECT 1 FROM application_dispatches d WHERE d.application_id = demo_dispatches.app_id AND d.salesman_user_id = @salesman_user_id);

INSERT INTO fulfillment_submissions (application_id, salesman_user_id, identity_verified, voucher_remark, verification_status, verifier_user_id, verified_at)
SELECT '10000000-0000-4000-8000-000000000004', @salesman_user_id, 1, '演示：已提交办理凭证，等待客服核销。', 'PENDING', NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM fulfillment_submissions WHERE application_id = '10000000-0000-4000-8000-000000000004');

INSERT INTO fulfillment_submissions (application_id, salesman_user_id, identity_verified, voucher_remark, verification_status, verifier_user_id, verified_at)
SELECT app_id, @salesman_user_id, 1, '演示：凭证已核销通过。', 'APPROVED', @service_user_id, NOW(3)
FROM (
  SELECT '10000000-0000-4000-8000-000000000005' AS app_id UNION ALL
  SELECT '10000000-0000-4000-8000-000000000006'
) AS demo_fulfillments
WHERE NOT EXISTS (SELECT 1 FROM fulfillment_submissions f WHERE f.application_id = demo_fulfillments.app_id);

INSERT INTO paper_bills (application_id, bill_number, bill_date, merchant_id, cashback_amount, commission_rate, commission_amount, status, recorded_by_user_id, confirmed_by_user_id, confirmed_at, note)
SELECT '10000000-0000-4000-8000-000000000005', 'DEMO-BILL-0001', '2026-07-19', @merchant_id, 600.00, 0.100000, 60.00, 'PENDING_CONFIRMATION', @finance_user_id, NULL, NULL, '演示待入账确认纸面账单'
WHERE NOT EXISTS (SELECT 1 FROM paper_bills WHERE bill_number = 'DEMO-BILL-0001');

INSERT INTO paper_bills (application_id, bill_number, bill_date, merchant_id, cashback_amount, commission_rate, commission_amount, status, recorded_by_user_id, confirmed_by_user_id, confirmed_at, note)
SELECT '10000000-0000-4000-8000-000000000006', 'DEMO-BILL-0002', '2026-07-18', @merchant_id, 800.00, 0.100000, 80.00, 'REFUND_POSTED', @finance_user_id, @finance_user_id, NOW(3), '演示返现完成入账纸面账单'
WHERE NOT EXISTS (SELECT 1 FROM paper_bills WHERE bill_number = 'DEMO-BILL-0002');

INSERT INTO audit_logs (actor_user_id, actor_role, action_code, target_type, target_id, after_data)
SELECT @finance_user_id, 'finance', 'DEMO_REFUND_POSTED', 'application', '10000000-0000-4000-8000-000000000006', JSON_OBJECT('refundStatus', 'REFUND_POSTED', 'amount', 800.00)
WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action_code = 'DEMO_REFUND_POSTED' AND target_id = '10000000-0000-4000-8000-000000000006');
