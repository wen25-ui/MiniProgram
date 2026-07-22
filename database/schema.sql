-- 微信小程序业务返现管理系统：MySQL 8.4 初始化脚本
-- 本脚本只创建尚不存在的表，不会删除已有数据。
-- 字符集统一使用 utf8mb4；金额均为账务记录，不代表或发起支付。

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) NOT NULL PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NULL,
  login_name VARCHAR(64) NULL,
  password_hash CHAR(64) NULL,
  display_name VARCHAR(80) NULL,
  account_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  phone_verified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_users_phone (phone),
  UNIQUE KEY uk_users_login_name (login_name),
  CONSTRAINT chk_users_account_status CHECK (account_status IN ('ACTIVE', 'DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS merchants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  contact_name VARCHAR(80) NULL,
  contact_phone VARCHAR(20) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_merchants_status CHECK (status IN ('ACTIVE', 'DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_code VARCHAR(32) NOT NULL,
  merchant_id BIGINT UNSIGNED NULL,
  assigned_merchant_id BIGINT UNSIGNED NULL,
  salesman_code VARCHAR(64) NULL,
  salesman_type VARCHAR(32) NULL,
  assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, role_code),
  KEY idx_user_roles_merchant (merchant_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_roles_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
  CONSTRAINT chk_user_roles_code CHECK (role_code IN ('client', 'merchant', 'salesman', 'customer-service', 'finance', 'boss', 'admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_auth_sessions_token_hash (token_hash),
  KEY idx_auth_sessions_user_expiry (user_id, expires_at),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS merchant_invites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id BIGINT UNSIGNED NOT NULL,
  invite_code VARCHAR(128) NOT NULL,
  source_type VARCHAR(24) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  expires_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_merchant_invites_code (invite_code),
  KEY idx_merchant_invites_merchant (merchant_id),
  CONSTRAINT fk_merchant_invites_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
  CONSTRAINT chk_merchant_invites_source CHECK (source_type IN ('merchant_qr', 'friend_share')),
  CONSTRAINT chk_merchant_invites_status CHECK (status IN ('ACTIVE', 'DISABLED', 'EXPIRED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS applications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  client_user_id BIGINT UNSIGNED NOT NULL,
  merchant_id BIGINT UNSIGNED NULL,
  merchant_invite_id BIGINT UNSIGNED NULL,
  source_type VARCHAR(24) NULL,
  phone_snapshot VARCHAR(20) NOT NULL,
  attribution_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_SERVICE',
  attribution_province VARCHAR(80) NULL,
  attribution_city VARCHAR(80) NULL,
  local_option VARCHAR(32) NULL,
  is_local_number TINYINT(1) NULL,
  accept_local_card TINYINT(1) NULL,
  is_local_resident TINYINT(1) NULL,
  expense_tier VARCHAR(32) NULL,
  commitments JSON NULL,
  pre_screen_passed TINYINT(1) NOT NULL DEFAULT 0,
  pre_screen_status VARCHAR(32) NOT NULL DEFAULT 'PRE_SCREEN_REJECTED',
  rule_version VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PRE_SCREEN_REJECTED',
  service_mode VARCHAR(32) NULL,
  verify_result VARCHAR(32) NULL,
  customer_intention VARCHAR(32) NULL,
  verification_remark VARCHAR(500) NULL,
  corrected_info JSON NULL,
  verified_by_user_id BIGINT UNSIGNED NULL,
  verified_at DATETIME(3) NULL,
  intention_confirmed_at DATETIME(3) NULL,
  contact_result VARCHAR(32) NULL,
  contact_reason VARCHAR(500) NULL,
  service_failure_reason VARCHAR(500) NULL,
  closed_reason VARCHAR(500) NULL,
  appointment_time DATETIME(0) NULL,
  assigned_merchant_id BIGINT UNSIGNED NULL,
  assigned_salesman_user_id BIGINT UNSIGNED NULL,
  expected_refund_amount DECIMAL(12,2) NULL,
  refund_status VARCHAR(32) NOT NULL DEFAULT 'NOT_RECORDED',
  screening_submitted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_applications_client_status (client_user_id, status, updated_at),
  KEY idx_applications_merchant_status (merchant_id, status, updated_at),
  KEY idx_applications_assigned_merchant (assigned_merchant_id),
  KEY idx_applications_salesman_status (assigned_salesman_user_id, status, appointment_time),
  KEY idx_applications_status_created (status, created_at),
  CONSTRAINT fk_applications_client FOREIGN KEY (client_user_id) REFERENCES users(id),
  CONSTRAINT fk_applications_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
  CONSTRAINT fk_applications_assigned_merchant FOREIGN KEY (assigned_merchant_id) REFERENCES merchants(id),
  CONSTRAINT fk_applications_invite FOREIGN KEY (merchant_invite_id) REFERENCES merchant_invites(id),
  CONSTRAINT fk_applications_salesman FOREIGN KEY (assigned_salesman_user_id) REFERENCES users(id),
  CONSTRAINT fk_applications_verifier FOREIGN KEY (verified_by_user_id) REFERENCES users(id),
  CONSTRAINT chk_applications_source CHECK (source_type IS NULL OR source_type IN ('merchant_qr', 'friend_share')),
  CONSTRAINT chk_applications_local_option CHECK (local_option IS NULL OR local_option IN ('LOCAL_RESIDENT', 'LOCAL_NUMBER', 'ACCEPT_LOCAL_CARD')),
  CONSTRAINT chk_applications_expense_tier CHECK (expense_tier IS NULL OR expense_tier IN ('UNDER_79', 'FROM_79', 'FROM_150', 'FROM_250', 'FROM_400')),
  CONSTRAINT chk_applications_status CHECK (status IN ('DEMAND_SUBMITTED', 'APPLICATION_SUBMITTED', 'PRE_SCREEN_REJECTED', 'PENDING', 'CONTACTING', 'VERIFYING', 'VERIFIED', 'INVALID_INFO', 'CORRECTING', 'CONFIRMED', 'CANCELLED', 'DISPATCHING', 'ASSIGNED', 'PROCESSING', 'COMPLETED', 'PENDING_REVIEW', 'REVIEW_REJECTED', 'PENDING_CONTACT', 'CONTACT_FAILED', 'CLIENT_DECLINED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'PENDING_SERVICE', 'IN_SERVICE', 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE', 'SERVICE_FAILED', 'PENDING_VERIFICATION', 'VERIFICATION_RETURNED', 'SERVICE_COMPLETED', 'WITHDRAWN', 'CLOSED')),
  CONSTRAINT chk_applications_service_mode CHECK (service_mode IS NULL OR service_mode IN ('HOME_SERVICE', 'STORE_SERVICE')),
  CONSTRAINT chk_applications_verify_result CHECK (verify_result IS NULL OR verify_result IN ('VERIFIED', 'INVALID_INFO')),
  CONSTRAINT chk_applications_customer_intention CHECK (customer_intention IS NULL OR customer_intention IN ('WILLING', 'UNWILLING')),
  CONSTRAINT chk_applications_contact_result CHECK (contact_result IS NULL OR contact_result IN ('CONTACTED', 'UNREACHABLE', 'CLIENT_DECLINED')),
  CONSTRAINT chk_applications_refund_status CHECK (refund_status IN ('NOT_RECORDED', 'RECORDED', 'PENDING_CONFIRMATION', 'REFUND_POSTED', 'CORRECTED', 'VOIDED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS application_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id CHAR(36) NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  action_code VARCHAR(48) NOT NULL,
  reason VARCHAR(500) NULL,
  operator_user_id BIGINT UNSIGNED NULL,
  operator_role VARCHAR(32) NULL,
  metadata JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_application_history_application_time (application_id, created_at),
  CONSTRAINT fk_application_history_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_application_history_operator FOREIGN KEY (operator_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS application_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id CHAR(36) NOT NULL,
  reviewer_user_id BIGINT UNSIGNED NOT NULL,
  decision VARCHAR(16) NOT NULL,
  reason VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_application_reviews_application (application_id, created_at),
  CONSTRAINT fk_application_reviews_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_application_reviews_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id),
  CONSTRAINT chk_application_reviews_decision CHECK (decision IN ('APPROVE', 'REJECT'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS application_contact_records (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS application_appointments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id CHAR(36) NOT NULL,
  appointment_time DATETIME(0) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'CONFIRMED',
  confirmed_by_user_id BIGINT UNSIGNED NOT NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_application_appointments_application (application_id, created_at),
  CONSTRAINT fk_application_appointments_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_application_appointments_operator FOREIGN KEY (confirmed_by_user_id) REFERENCES users(id),
  CONSTRAINT chk_application_appointments_status CHECK (status IN ('CONFIRMED', 'CANCELLED', 'CHANGED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS application_dispatches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id CHAR(36) NOT NULL,
  salesman_user_id BIGINT UNSIGNED NULL,
  submitted_by_user_id BIGINT UNSIGNED NULL,
  dispatcher_user_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ASSIGNED',
  note VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_application_dispatches_salesman_status (salesman_user_id, status, created_at),
  KEY idx_application_dispatches_application (application_id, created_at),
  CONSTRAINT fk_application_dispatches_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_application_dispatches_salesman FOREIGN KEY (salesman_user_id) REFERENCES users(id),
  CONSTRAINT fk_application_dispatches_dispatcher FOREIGN KEY (dispatcher_user_id) REFERENCES users(id),
  CONSTRAINT chk_application_dispatches_status CHECK (status IN ('ASSIGNED', 'ACCEPTED', 'REJECTED', 'REASSIGNED', 'CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fulfillment_submissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id CHAR(36) NOT NULL,
  salesman_user_id BIGINT UNSIGNED NULL,
  submitted_by_user_id BIGINT UNSIGNED NULL,
  identity_verified TINYINT(1) NOT NULL,
  voucher_remark VARCHAR(1000) NOT NULL,
  verification_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  verification_reason VARCHAR(500) NULL,
  verifier_user_id BIGINT UNSIGNED NULL,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  verified_at DATETIME(3) NULL,
  KEY idx_fulfillment_application (application_id, submitted_at),
  KEY idx_fulfillment_verification (verification_status, submitted_at),
  CONSTRAINT fk_fulfillment_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_fulfillment_salesman FOREIGN KEY (salesman_user_id) REFERENCES users(id),
  CONSTRAINT fk_fulfillment_submitter FOREIGN KEY (submitted_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_fulfillment_verifier FOREIGN KEY (verifier_user_id) REFERENCES users(id),
  CONSTRAINT chk_fulfillment_verification CHECK (verification_status IN ('PENDING', 'APPROVED', 'RETURNED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fulfillment_voucher_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  fulfillment_submission_id BIGINT UNSIGNED NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  file_name VARCHAR(255) NULL,
  content_type VARCHAR(100) NULL,
  file_size_bytes BIGINT UNSIGNED NULL,
  checksum_sha256 CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_voucher_attachments_submission (fulfillment_submission_id),
  CONSTRAINT fk_voucher_attachments_submission FOREIGN KEY (fulfillment_submission_id) REFERENCES fulfillment_submissions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS paper_bills (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id CHAR(36) NOT NULL,
  bill_number VARCHAR(100) NOT NULL,
  bill_date DATE NOT NULL,
  merchant_id BIGINT UNSIGNED NULL,
  cashback_amount DECIMAL(12,2) NULL,
  commission_rate DECIMAL(7,6) NULL,
  commission_amount DECIMAL(12,2) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'RECORDED',
  recorded_by_user_id BIGINT UNSIGNED NOT NULL,
  confirmed_by_user_id BIGINT UNSIGNED NULL,
  confirmed_at DATETIME(3) NULL,
  voided_reason VARCHAR(500) NULL,
  note VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_paper_bills_number (bill_number),
  KEY idx_paper_bills_application (application_id),
  KEY idx_paper_bills_status_date (status, bill_date),
  CONSTRAINT fk_paper_bills_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_paper_bills_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
  CONSTRAINT fk_paper_bills_recorder FOREIGN KEY (recorded_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_paper_bills_confirmer FOREIGN KEY (confirmed_by_user_id) REFERENCES users(id),
  CONSTRAINT chk_paper_bills_status CHECK (status IN ('NOT_RECORDED', 'RECORDED', 'PENDING_CONFIRMATION', 'REFUND_POSTED', 'CORRECTED', 'VOIDED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NULL,
  actor_role VARCHAR(32) NULL,
  action_code VARCHAR(64) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_logs_target (target_type, target_id, created_at),
  KEY idx_audit_logs_actor_time (actor_user_id, created_at),
  CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO schema_migrations (version) VALUES ('2026-07-18-initial')
ON DUPLICATE KEY UPDATE version = VALUES(version);
INSERT INTO schema_migrations (version) VALUES ('2026-07-18-auth-sessions')
ON DUPLICATE KEY UPDATE version = VALUES(version);
