ALTER TABLE user_roles
  DROP CHECK chk_user_roles_code,
  ADD CONSTRAINT chk_user_roles_code
    CHECK (role_code IN ('client', 'merchant', 'salesman', 'customer-service', 'finance', 'boss', 'admin'));
