-- Migration: Create Migration Logs Table
-- Date: 2026-03-21
-- Description: Creates migration_logs table to audit and track opening balance migrations

-- =====================================================
-- MIGRATION LOGS TABLE
-- =====================================================
-- Stores detailed logs for each student processed during migration
CREATE TABLE IF NOT EXISTS migration_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID,
  roll_no INT NOT NULL,
  pending_due_inserted DECIMAL(10, 2) DEFAULT 0,
  advance_inserted DECIMAL(10, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'PENDING', -- 'success', 'skipped', 'error'
  error TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_migration_logs_student_id ON migration_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_migration_logs_roll_no ON migration_logs(roll_no);
CREATE INDEX IF NOT EXISTS idx_migration_logs_status ON migration_logs(status);
CREATE INDEX IF NOT EXISTS idx_migration_logs_created_at ON migration_logs(created_at);

-- Comments for documentation
COMMENT ON TABLE migration_logs IS 'Audit trail for opening balance migrations';
COMMENT ON COLUMN migration_logs.student_id IS 'Reference to student (null if student not found)';
COMMENT ON COLUMN migration_logs.roll_no IS 'Student roll number from migration request';
COMMENT ON COLUMN migration_logs.pending_due_inserted IS 'Amount of pending due inserted in previous_dues table';
COMMENT ON COLUMN migration_logs.advance_inserted IS 'Amount of advance inserted in advance_ledger table';
COMMENT ON COLUMN migration_logs.status IS 'Migration status for this student: success, skipped, or error';
COMMENT ON COLUMN migration_logs.error IS 'Error message if status is error or skipped';
