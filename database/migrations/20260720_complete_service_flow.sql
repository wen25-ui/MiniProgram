ALTER TABLE applications
  DROP CHECK chk_applications_status,
  ADD COLUMN service_mode VARCHAR(32) NULL AFTER status,
  ADD COLUMN contact_result VARCHAR(32) NULL AFTER service_mode,
  ADD COLUMN contact_reason VARCHAR(500) NULL AFTER contact_result,
  ADD COLUMN service_failure_reason VARCHAR(500) NULL AFTER contact_reason,
  ADD COLUMN closed_reason VARCHAR(500) NULL AFTER service_failure_reason,
  ADD CONSTRAINT chk_applications_status CHECK (
    status IN ('DEMAND_SUBMITTED', 'APPLICATION_SUBMITTED', 'PRE_SCREEN_REJECTED', 'PENDING_REVIEW', 'REVIEW_REJECTED', 'PENDING_CONTACT', 'CONTACT_FAILED', 'CLIENT_DECLINED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'PENDING_SERVICE', 'IN_SERVICE', 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE', 'SERVICE_FAILED', 'PENDING_VERIFICATION', 'VERIFICATION_RETURNED', 'SERVICE_COMPLETED', 'WITHDRAWN', 'CLOSED')
  ),
  ADD CONSTRAINT chk_applications_service_mode CHECK (service_mode IS NULL OR service_mode IN ('HOME_SERVICE', 'STORE_SERVICE')),
  ADD CONSTRAINT chk_applications_contact_result CHECK (contact_result IS NULL OR contact_result IN ('CONTACTED', 'UNREACHABLE', 'CLIENT_DECLINED'));

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

ALTER TABLE fulfillment_submissions
  MODIFY salesman_user_id BIGINT UNSIGNED NULL,
  ADD COLUMN submitted_by_user_id BIGINT UNSIGNED NULL AFTER salesman_user_id,
  ADD CONSTRAINT fk_fulfillment_submitter FOREIGN KEY (submitted_by_user_id) REFERENCES users(id);

INSERT INTO schema_migrations (version) VALUES ('2026-07-20-complete-service-flow')
ON DUPLICATE KEY UPDATE version = VALUES(version);
