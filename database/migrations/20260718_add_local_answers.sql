ALTER TABLE applications
  ADD COLUMN is_local_number TINYINT(1) NULL AFTER local_option,
  ADD COLUMN accept_local_card TINYINT(1) NULL AFTER is_local_number,
  ADD COLUMN is_local_resident TINYINT(1) NULL AFTER accept_local_card;
