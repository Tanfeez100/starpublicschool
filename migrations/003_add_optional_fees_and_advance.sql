-- Migration: Add optional fees and advance payment support
-- Date: 2026-01-22
-- Description: Adds transport_fee, exam_fee, annual_fee, advance columns to fees table
--              and uses_transport to students table

-- Add uses_transport column to students table if it doesn't exist
ALTER TABLE IF EXISTS students
ADD COLUMN IF NOT EXISTS uses_transport BOOLEAN DEFAULT FALSE;

-- Add new fee columns to fees table if they don't exist
ALTER TABLE IF EXISTS fees
ADD COLUMN IF NOT EXISTS transport_fee DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS exam_fee DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS annual_fee DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS advance DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS fine DECIMAL(10, 2) DEFAULT 0;

-- Create index for faster student queries by class
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class);

-- Create index for faster fee queries by student and month
CREATE INDEX IF NOT EXISTS idx_fees_student_month ON fees(student_id, month);

-- Add comment documentation
COMMENT ON COLUMN students.uses_transport IS 'Whether the student uses school transport facility';
COMMENT ON COLUMN fees.transport_fee IS 'Transport fee for the month (only charged if uses_transport = true)';
COMMENT ON COLUMN fees.exam_fee IS 'Exam fee for the month (optional)';
COMMENT ON COLUMN fees.annual_fee IS 'Annual fee for the month (optional)';
COMMENT ON COLUMN fees.advance IS 'Advance amount paid by student to be deducted in next month';
COMMENT ON COLUMN fees.fine IS 'Fine amount for overdue payment';
