ALTER TABLE users
  MODIFY COLUMN phone VARCHAR(20) NULL,
  ADD COLUMN login_name VARCHAR(64) NULL AFTER phone,
  ADD UNIQUE KEY uk_users_login_name (login_name);
