ALTER TABLE user_roles ADD COLUMN service_region VARCHAR(120) NULL AFTER salesman_type;
ALTER TABLE applications ADD COLUMN service_address VARCHAR(500) NULL AFTER appointment_time;
ALTER TABLE applications ADD COLUMN service_region VARCHAR(120) NULL AFTER service_address;
ALTER TABLE merchants ADD COLUMN service_region VARCHAR(120) NULL AFTER contact_phone;
CREATE INDEX idx_user_roles_salesman_region ON user_roles (role_code, salesman_type, service_region);
CREATE INDEX idx_applications_service_region ON applications (service_mode, service_region, status);
CREATE INDEX idx_merchants_service_region ON merchants (service_region, status);
