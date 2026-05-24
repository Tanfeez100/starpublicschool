-- Migration: Create Migration Control Table
-- Date: 2026-03-21
-- Description: Creates migration_control table to manage migration locks

-- =====================================================
-- MIGRATION CONTROL TABLE
-- =====================================================
-- Manages migration locks to prevent concurrent migrations for the same month
CREATE TABLE IF NOT EXISTS migration_control (
  migration_month VARCHAR(7) PRIMARY KEY, -- YYYY-MM format
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_migration_control_completed ON migration_control(is_completed);

-- Comments for documentation
COMMENT ON TABLE migration_control IS 'Controls migration locks to prevent concurrent migrations';
COMMENT ON COLUMN migration_control.migration_month IS 'Migration month in YYYY-MM format';
COMMENT ON COLUMN migration_control.is_completed IS 'Whether the migration for this month is completed';