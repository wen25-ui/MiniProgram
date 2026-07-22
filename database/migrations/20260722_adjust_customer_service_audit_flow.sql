ALTER TABLE applications
  ADD COLUMN verify_result VARCHAR(32) NULL AFTER service_mode,
  ADD COLUMN customer_intention VARCHAR(32) NULL AFTER verify_result,
  ADD COLUMN verification_remark VARCHAR(500) NULL AFTER customer_intention,
  ADD COLUMN corrected_info JSON NULL AFTER verification_remark,
  ADD COLUMN verified_by_user_id BIGINT UNSIGNED NULL AFTER corrected_info,
  ADD COLUMN verified_at DATETIME(3) NULL AFTER verified_by_user_id,
  ADD COLUMN intention_confirmed_at DATETIME(3) NULL AFTER verified_at,
  ADD CONSTRAINT fk_applications_verifier FOREIGN KEY (verified_by_user_id) REFERENCES users(id),
  ADD CONSTRAINT chk_applications_verify_result CHECK (verify_result IS NULL OR verify_result IN ('VERIFIED', 'INVALID_INFO')),
  ADD CONSTRAINT chk_applications_customer_intention CHECK (customer_intention IS NULL OR customer_intention IN ('WILLING', 'UNWILLING'));

ALTER TABLE applications DROP CHECK chk_applications_status;
ALTER TABLE applications ADD CONSTRAINT chk_applications_status CHECK (
  status IN ('DEMAND_SUBMITTED', 'APPLICATION_SUBMITTED', 'PRE_SCREEN_REJECTED', 'PENDING', 'CONTACTING', 'VERIFYING', 'VERIFIED', 'INVALID_INFO', 'CORRECTING', 'CONFIRMED', 'CANCELLED', 'DISPATCHING', 'ASSIGNED', 'PROCESSING', 'COMPLETED', 'PENDING_REVIEW', 'REVIEW_REJECTED', 'PENDING_CONTACT', 'CONTACT_FAILED', 'CLIENT_DECLINED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'PENDING_SERVICE', 'IN_SERVICE', 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE', 'SERVICE_FAILED', 'PENDING_VERIFICATION', 'VERIFICATION_RETURNED', 'SERVICE_COMPLETED', 'WITHDRAWN', 'CLOSED')
);

UPDATE applications SET status = 'PENDING' WHERE status = 'PENDING_REVIEW';
UPDATE applications SET status = 'CONTACTING' WHERE status IN ('PENDING_CONTACT', 'CONTACT_FAILED');
UPDATE applications SET status = 'CONFIRMED' WHERE status IN ('PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT');
UPDATE applications SET status = 'DISPATCHING' WHERE status = 'PENDING_DISPATCH';
UPDATE applications SET status = 'ASSIGNED' WHERE status IN ('PENDING_SERVICE', 'PENDING_STORE_SERVICE');
UPDATE applications SET status = 'PROCESSING' WHERE status IN ('IN_SERVICE', 'IN_STORE_SERVICE');
UPDATE applications SET status = 'CANCELLED' WHERE status IN ('REVIEW_REJECTED', 'CLIENT_DECLINED');
UPDATE applications SET status = 'COMPLETED' WHERE status = 'SERVICE_COMPLETED';

INSERT INTO schema_migrations (version) VALUES ('2026-07-22-adjust-customer-service-audit-flow')
ON DUPLICATE KEY UPDATE version = VALUES(version);
