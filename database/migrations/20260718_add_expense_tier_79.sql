ALTER TABLE applications
  DROP CHECK chk_applications_expense_tier,
  ADD CONSTRAINT chk_applications_expense_tier
    CHECK (expense_tier IS NULL OR expense_tier IN ('UNDER_79', 'FROM_79', 'FROM_150', 'FROM_250', 'FROM_400'));
