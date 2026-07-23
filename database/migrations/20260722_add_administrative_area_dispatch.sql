CREATE TABLE IF NOT EXISTS sys_area (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  parent_id BIGINT UNSIGNED NULL,
  name VARCHAR(80) NOT NULL,
  level TINYINT UNSIGNED NOT NULL,
  UNIQUE KEY uk_sys_area_parent_name (parent_id, name),
  KEY idx_sys_area_parent_level (parent_id, level),
  CONSTRAINT fk_sys_area_parent FOREIGN KEY (parent_id) REFERENCES sys_area(id),
  CONSTRAINT chk_sys_area_level CHECK (level IN (1, 2, 3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sys_area_neighbor (
  area_id BIGINT UNSIGNED NOT NULL,
  neighbor_area_id BIGINT UNSIGNED NOT NULL,
  sort_order INT UNSIGNED NOT NULL,
  PRIMARY KEY (area_id, neighbor_area_id),
  UNIQUE KEY uk_sys_area_neighbor_order (area_id, sort_order),
  CONSTRAINT fk_sys_area_neighbor_area FOREIGN KEY (area_id) REFERENCES sys_area(id),
  CONSTRAINT fk_sys_area_neighbor_target FOREIGN KEY (neighbor_area_id) REFERENCES sys_area(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE applications ADD COLUMN province VARCHAR(80) NULL AFTER service_region,
  ADD COLUMN city VARCHAR(80) NULL AFTER province, ADD COLUMN district VARCHAR(80) NULL AFTER city,
  ADD COLUMN detail_address VARCHAR(500) NULL AFTER district, ADD COLUMN district_area_id BIGINT UNSIGNED NULL AFTER detail_address,
  ADD COLUMN latitude DECIMAL(10,7) NULL AFTER district_area_id, ADD COLUMN longitude DECIMAL(10,7) NULL AFTER latitude,
  ADD KEY idx_applications_district_status (district_area_id, status),
  ADD CONSTRAINT fk_applications_district_area FOREIGN KEY (district_area_id) REFERENCES sys_area(id);
ALTER TABLE merchants ADD COLUMN area_id BIGINT UNSIGNED NULL AFTER service_region,
  ADD COLUMN latitude DECIMAL(10,7) NULL AFTER area_id, ADD COLUMN longitude DECIMAL(10,7) NULL AFTER latitude,
  ADD KEY idx_merchants_area_status (area_id, status), ADD CONSTRAINT fk_merchants_area FOREIGN KEY (area_id) REFERENCES sys_area(id);
ALTER TABLE user_roles ADD COLUMN area_id BIGINT UNSIGNED NULL AFTER service_region,
  ADD KEY idx_user_roles_salesman_area (role_code, salesman_type, area_id),
  ADD CONSTRAINT fk_user_roles_area FOREIGN KEY (area_id) REFERENCES sys_area(id);
