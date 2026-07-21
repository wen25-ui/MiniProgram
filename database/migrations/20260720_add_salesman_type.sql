ALTER TABLE user_roles
  ADD COLUMN salesman_type VARCHAR(32) NULL AFTER salesman_code;

UPDATE user_roles
SET salesman_type = 'HOME_VISIT'
WHERE role_code = 'salesman' AND salesman_type IS NULL;
