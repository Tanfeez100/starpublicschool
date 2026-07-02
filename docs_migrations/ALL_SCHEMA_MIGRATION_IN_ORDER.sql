-- Full schema migration generated from DB_SCHEMA_AND_FUNCTIONS_ORDERED.md
-- Order matches the documentation. Destructive/data-only utility steps are noted and skipped.
-- Run on a database where the Supabase auth schema already exists.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;


-- ============================================================
-- 0. Base compatibility tables
-- ============================================================
-- These tables are referenced by later migrations and existing backend code.
-- Keeping them here allows a blank database to bootstrap cleanly.

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  father_name text,
  mother_name text,
  gender text,
  class text not null,
  section text not null,
  roll_no integer not null,
  academic_year text not null,
  status text not null default 'active',
  left_date date,
  mobile text,
  address text,
  uses_transport boolean not null default false,
  transport_charge numeric(10,2),
  aadhaar_card varchar(12),
  pen_number varchar(32),
  username text,
  date_of_birth date,
  admission_number text,
  admission_date date,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_students_status check (status in ('active', 'inactive')),
  constraint chk_students_class_allowed check (class in ('Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8')),
  constraint chk_students_academic_year_format check (academic_year ~ '^\d{4}-(\d{2}|\d{4})$'),
  constraint chk_students_roll_no_positive check (roll_no > 0),
  constraint chk_students_left_date_consistency check (
    (status = 'active' and left_date is null) or
    (status = 'inactive' and left_date is not null)
  )
);

create index if not exists idx_students_class on public.students (class);
create index if not exists idx_students_class_section_year on public.students (class, section, academic_year);
create index if not exists idx_students_roll_no on public.students (roll_no);
create index if not exists idx_students_admission_date on public.students (admission_date);
create index if not exists idx_students_aadhaar on public.students (aadhaar_card);
create index if not exists idx_students_pen_number on public.students (pen_number);
create unique index if not exists idx_students_username_unique
  on public.students (username)
  where username is not null and username <> '';
create unique index if not exists idx_students_admission_number_unique
  on public.students (admission_number)
  where admission_number is not null and admission_number <> '';
create unique index if not exists uq_students_roll_active_per_year
  on public.students (class, section, academic_year, roll_no)
  where status = 'active';

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_user_roles_role check (role in ('admin', 'teacher'))
);

create index if not exists idx_user_roles_role on public.user_roles (role);

create table if not exists public.fee_structure (
  id uuid primary key default gen_random_uuid(),
  class text not null,
  section text,
  tuition_fee numeric(10,2) not null default 0,
  exam_fee numeric(10,2) not null default 0,
  annual_fee numeric(10,2) not null default 0,
  computer_fee numeric(10,2) not null default 0,
  fee_name text,
  fee_amount numeric(10,2),
  is_optional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fee_structure_class on public.fee_structure (class);
create index if not exists idx_fee_structure_class_section on public.fee_structure (class, section);
create index if not exists idx_fee_structure_fee_name on public.fee_structure (fee_name);

create table if not exists public.fees (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class text not null,
  section text,
  roll_no integer not null,
  month varchar(7) not null,
  year int not null,
  tuition_fee numeric(10,2) not null default 0,
  exam_fee numeric(10,2) not null default 0,
  annual_fee numeric(10,2) not null default 0,
  computer_fee numeric(10,2) not null default 0,
  transport_fee numeric(10,2) not null default 0,
  previous_due numeric(10,2) not null default 0,
  advance numeric(10,2) not null default 0,
  fine numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  net_payable numeric(10,2) not null default 0,
  paid_amount numeric(10,2) not null default 0,
  bill_status varchar(20) not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_fees_month_format check (month ~ '^\d{4}-\d{2}$'),
  constraint chk_fees_bill_status check (bill_status in ('paid', 'unpaid', 'partial'))
);

create index if not exists idx_fees_student on public.fees (student_id);
create index if not exists idx_fees_student_month on public.fees (student_id, month);
create index if not exists idx_fees_month on public.fees (month);
create index if not exists idx_fees_year on public.fees (year);
create index if not exists idx_fees_status on public.fees (bill_status);

alter table public.students enable row level security;
alter table public.user_roles enable row level security;
alter table public.fee_structure enable row level security;
alter table public.fees enable row level security;

grant all on table public.students to service_role;
grant all on table public.user_roles to service_role;
grant all on table public.fee_structure to service_role;
grant all on table public.fees to service_role;

drop policy if exists "students_service_role_all" on public.students;
create policy "students_service_role_all"
on public.students
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "user_roles_service_role_all" on public.user_roles;
create policy "user_roles_service_role_all"
on public.user_roles
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "fee_structure_service_role_all" on public.fee_structure;
create policy "fee_structure_service_role_all"
on public.fee_structure
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "fees_service_role_all" on public.fees;
create policy "fees_service_role_all"
on public.fees
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- ============================================================
-- 1. migrations/001_create_subjects_table.sql
-- ============================================================
-- Create subjects table (Master list of all subjects)
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL UNIQUE,
  code VARCHAR(10) NOT NULL UNIQUE,
  max_external_marks INT DEFAULT 80,
  max_internal_marks INT DEFAULT 20,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Create class_subjects table (Curriculum mapping)
CREATE TABLE IF NOT EXISTS class_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class VARCHAR(20) NOT NULL,
  subject_id UUID NOT NULL,
  sequence INT,
  created_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE(class, subject_id)
);

-- Drop old marks table if exists (backup first!)
-- ALTER TABLE marks RENAME TO marks_old;

-- Create new normalized marks table
CREATE TABLE IF NOT EXISTS marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  terminal VARCHAR(20) NOT NULL,
  external_marks DECIMAL(5,2),
  internal_marks DECIMAL(5,2),
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE(student_id, subject_id, terminal)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_marks_student ON marks(student_id);
CREATE INDEX IF NOT EXISTS idx_marks_terminal ON marks(terminal);
CREATE INDEX IF NOT EXISTS idx_marks_student_terminal ON marks(student_id, terminal);
CREATE INDEX IF NOT EXISTS idx_class_subjects_class ON class_subjects(class);

-- Optional: Create result_summary table for caching
CREATE TABLE IF NOT EXISTS result_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL,
  terminal VARCHAR(20) NOT NULL,
  total_marks DECIMAL(7,2),
  total_obtained DECIMAL(7,2),
  percentage DECIMAL(5,2),
  division VARCHAR(20),
  rank INT,
  status VARCHAR(20),
  calculated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE(student_id, terminal)
);

CREATE INDEX IF NOT EXISTS idx_result_summary_student ON result_summary(student_id);

-- ============================================================
-- 2. migrations/002_create_user_sessions.sql
-- ============================================================
-- Create user_sessions table to track active sessions
-- This table stores active tokens to prevent access after logout
-- Note: user_id references auth.users(id) but foreign key constraint is not possible in Supabase
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL, -- References auth.users(id) but no FK constraint
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP NOT NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active, expires_at);

-- Function to clean up expired sessions (optional, can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM user_sessions 
  WHERE expires_at < now() OR is_active = false;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 3. migrations/002_seed_subjects_and_curriculum.sql
-- ============================================================
-- Insert all subjects
INSERT INTO subjects (name, code, max_external_marks, max_internal_marks) VALUES
-- Core subjects
('Hindi', 'HND', 80, 20),
('Hindi Writing', 'HNW', 80, 20),
('English', 'ENG', 80, 20),
('English Writing', 'ENW', 80, 20),
('Math', 'MTH', 80, 20),
('Drawing', 'DRW', 50, 0),

-- Additional subjects
('EVS', 'EVS', 80, 20),
('General Knowledge', 'GK', 80, 20),
('Sanskrit', 'SKT', 80, 20),
('Urdu', 'URD', 80, 20),
('Computer', 'COM', 80, 20),
('Science', 'SCI', 80, 20),
('Social Studies', 'SST', 80, 20)
ON CONFLICT (code) DO NOTHING;

INSERT INTO class_subjects (class, subject_id, sequence) 
SELECT 'Nursery', id, row_number() OVER (ORDER BY code) FROM subjects 
WHERE code IN ('HND', 'HNW', 'ENG', 'ENW', 'MTH', 'DRW')
ON CONFLICT DO NOTHING;

INSERT INTO class_subjects (class, subject_id, sequence) 
SELECT 'LKG', id, row_number() OVER (ORDER BY code) FROM subjects 
WHERE code IN ('HND', 'HNW', 'ENG', 'ENW', 'MTH', 'DRW')
ON CONFLICT DO NOTHING;

-- UKG subjects mapping
INSERT INTO class_subjects (class, subject_id, sequence) 
SELECT 'UKG', id, row_number() OVER (ORDER BY code) FROM subjects 
WHERE code IN ('HND', 'ENG', 'MTH', 'EVS', 'GK', 'DRW')
ON CONFLICT DO NOTHING;

-- Classes 1-5 subjects mapping
INSERT INTO class_subjects (class, subject_id, sequence) 
SELECT '1', id, row_number() OVER (ORDER BY code) FROM subjects 
WHERE code IN ('HND', 'ENG', 'MTH', 'EVS', 'SKT', 'COM', 'GK', 'DRW')
ON CONFLICT DO NOTHING;

INSERT INTO class_subjects (class, subject_id, sequence) 
SELECT '2', id, row_number() OVER (ORDER BY code) FROM subjects 
WHERE code IN ('HND', 'ENG', 'MTH', 'EVS', 'SKT', 'COM', 'GK', 'DRW')
ON CONFLICT DO NOTHING;

INSERT INTO class_subjects (class, subject_id, sequence) 
SELECT '3', id, row_number() OVER (ORDER BY code) FROM subjects 
WHERE code IN ('HND', 'ENG', 'MTH', 'EVS', 'SKT', 'COM', 'GK', 'DRW')
ON CONFLICT DO NOTHING;

INSERT INTO class_subjects (class, subject_id, sequence) 
SELECT '4', id, row_number() OVER (ORDER BY code) FROM subjects 
WHERE code IN ('HND', 'ENG', 'MTH', 'EVS', 'SKT', 'COM', 'GK', 'DRW')
ON CONFLICT DO NOTHING;

INSERT INTO class_subjects (class, subject_id, sequence) 
SELECT '5', id, row_number() OVER (ORDER BY code) FROM subjects 
WHERE code IN ('HND', 'ENG', 'MTH', 'EVS', 'SKT', 'COM', 'GK', 'DRW')
ON CONFLICT DO NOTHING;

-- Classes 6-8 subjects mapping (Hindi, English, Science, Math, SST, GK, Computer, Sanskrit/Urdu, Drawing)
INSERT INTO class_subjects (class, subject_id, sequence) 
SELECT '6', id, row_number() OVER (ORDER BY code) FROM subjects 
WHERE code IN ('HND', 'ENG', 'SCI', 'MTH', 'SST', 'GK', 'COM', 'SKT', 'DRW')
ON CONFLICT DO NOTHING;

INSERT INTO class_subjects (class, subject_id, sequence) 
SELECT '7', id, row_number() OVER (ORDER BY code) FROM subjects 
WHERE code IN ('HND', 'ENG', 'SCI', 'MTH', 'SST', 'GK', 'COM', 'SKT', 'DRW')
ON CONFLICT DO NOTHING;

INSERT INTO class_subjects (class, subject_id, sequence) 
SELECT '8', id, row_number() OVER (ORDER BY code) FROM subjects 
WHERE code IN ('HND', 'ENG', 'SCI', 'MTH', 'SST', 'GK', 'COM', 'SKT', 'DRW')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. migrations/003_add_optional_fees_and_advance.sql
-- ============================================================
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

-- ============================================================
-- 5. migrations/004_add_section_to_class_subjects.sql
-- ============================================================
-- Add section column to class_subjects table
ALTER TABLE class_subjects 
ADD COLUMN IF NOT EXISTS section VARCHAR(10);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_class_subjects_class_section ON class_subjects(class, section);

-- Update unique constraint to include section (optional - uncomment if needed)
-- ALTER TABLE class_subjects DROP CONSTRAINT IF EXISTS class_subjects_class_subject_id_key;
-- ALTER TABLE class_subjects ADD CONSTRAINT class_subjects_class_section_subject_id_key UNIQUE(class, section, subject_id);


-- ============================================================
-- 6. migrations/005_clear_all_data_keep_auth.sql
-- ============================================================
-- Skipped here because it deletes application data.

-- ============================================================
-- 7. migrations/006_create_fee_management_tables.sql
-- ============================================================
-- =====================================================
-- FEE MANAGEMENT SYSTEM - DATABASE TABLES
-- =====================================================
-- Migration: Create Fee Management System Tables
-- Date: 2026-01-22
-- Description: Creates all normalized fee management tables
-- 
-- IMPORTANT: Run this in Supabase SQL Editor
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. FEE STRUCTURES TABLE (Normalized)
-- =====================================================
-- Replaces old fee_structure table with flexible structure
-- One row per fee type per class/section
CREATE TABLE IF NOT EXISTS fee_structures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class VARCHAR(20) NOT NULL,
  section VARCHAR(20),
  fee_name VARCHAR(100) NOT NULL,
  fee_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  is_optional BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_fee_structures_class_section ON fee_structures(class, section);
CREATE INDEX IF NOT EXISTS idx_fee_structures_class ON fee_structures(class);
CREATE INDEX IF NOT EXISTS idx_fee_structures_fee_name ON fee_structures(fee_name);

-- =====================================================
-- 2. FEE BILLS TABLE
-- =====================================================
-- Main bills table - one bill per student per month
CREATE TABLE IF NOT EXISTS fee_bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL,
  month VARCHAR(7) NOT NULL, -- YYYY-MM format
  year INT NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  bill_status VARCHAR(20) DEFAULT 'unpaid', -- paid/unpaid/partial
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE(student_id, month)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_fee_bills_student ON fee_bills(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_bills_month ON fee_bills(month);
CREATE INDEX IF NOT EXISTS idx_fee_bills_year ON fee_bills(year);
CREATE INDEX IF NOT EXISTS idx_fee_bills_status ON fee_bills(bill_status);
CREATE INDEX IF NOT EXISTS idx_fee_bills_student_month ON fee_bills(student_id, month);

-- =====================================================
-- 3. FEE BILL ITEMS TABLE
-- =====================================================
-- Individual fee items in each bill (normalized)
-- One row per fee type in a bill
CREATE TABLE IF NOT EXISTS fee_bill_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL,
  fee_name VARCHAR(100) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (bill_id) REFERENCES fee_bills(id) ON DELETE CASCADE
);

-- Index for faster bill item lookups
CREATE INDEX IF NOT EXISTS idx_fee_bill_items_bill ON fee_bill_items(bill_id);

-- =====================================================
-- 4. FEE PAYMENTS TABLE
-- =====================================================
-- Payment records for fee bills
-- Multiple payments can be made for one bill
CREATE TABLE IF NOT EXISTS fee_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL,
  bill_id UUID NOT NULL,
  amount_paid DECIMAL(10, 2) NOT NULL DEFAULT 0,
  payment_mode VARCHAR(50) NOT NULL, -- cash/cheque/online/bank_transfer
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_id TEXT,
  receipt_no TEXT,
  created_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (bill_id) REFERENCES fee_bills(id) ON DELETE CASCADE
);

-- Indexes for faster payment queries
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_bill ON fee_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_date ON fee_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student_bill ON fee_payments(student_id, bill_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_payments_transaction_id_unique
  ON fee_payments(transaction_id)
  WHERE transaction_id IS NOT NULL AND transaction_id <> '';

-- =====================================================
-- 5. PREVIOUS DUES TABLE
-- =====================================================
-- Previous month dues carried forward
-- Check if table exists, if not create it
CREATE TABLE IF NOT EXISTS previous_dues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL,
  remaining_dues DECIMAL(10, 2) NOT NULL DEFAULT 0, -- Remaining dues amount
  original_due DECIMAL(10, 2) DEFAULT 0, -- Original due amount
  remaining_due DECIMAL(10, 2) DEFAULT 0, -- Remaining due tracking (legacy)
  from_month VARCHAR(7), -- From which month (for tracking)
  month VARCHAR(7) NOT NULL, -- YYYY-MM format
  year INT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending/cleared
  cleared BOOLEAN DEFAULT false, -- Whether cleared flag
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Add status column if table exists but column doesn't exist
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'previous_dues') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'status') THEN
      ALTER TABLE previous_dues ADD COLUMN status VARCHAR(20) DEFAULT 'pending';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'year') THEN
      ALTER TABLE previous_dues ADD COLUMN year INT;
      -- Update year from month if month exists
      UPDATE previous_dues SET year = CAST(SUBSTRING(month, 1, 4) AS INT) WHERE year IS NULL AND month IS NOT NULL;
    END IF;
  END IF;
END $$;

-- Indexes for faster dues queries
CREATE INDEX IF NOT EXISTS idx_previous_dues_student ON previous_dues(student_id);
CREATE INDEX IF NOT EXISTS idx_previous_dues_month ON previous_dues(month);
-- Only create status index if status column exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_previous_dues_status ON previous_dues(status);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_previous_dues_student_month ON previous_dues(student_id, month);

-- =====================================================
-- 6. MONTH CLOSURE TRACKING TABLE
-- =====================================================
-- Track which months have been closed to prevent duplicates
CREATE TABLE IF NOT EXISTS month_closures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month VARCHAR(7) NOT NULL UNIQUE, -- YYYY-MM format
  year INT NOT NULL,
  closed_by UUID, -- user_id who closed the month
  closed_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (closed_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index for faster month closure lookups
CREATE INDEX IF NOT EXISTS idx_month_closures_month ON month_closures(month);
CREATE INDEX IF NOT EXISTS idx_month_closures_year ON month_closures(year);

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================
COMMENT ON TABLE fee_structures IS 'Normalized fee structure - one row per fee type per class/section';
COMMENT ON TABLE fee_bills IS 'Fee bills generated for students per month';
COMMENT ON TABLE fee_bill_items IS 'Individual fee items in a bill (normalized)';
COMMENT ON TABLE fee_payments IS 'Payment records for fee bills';
COMMENT ON TABLE previous_dues IS 'Previous month dues carried forward';
COMMENT ON TABLE month_closures IS 'Tracks closed months to prevent duplicate closing';

COMMENT ON COLUMN fee_structures.is_optional IS 'Whether this fee is optional (e.g., computer fee, transport)';
COMMENT ON COLUMN fee_bills.bill_status IS 'Status: paid, unpaid, or partial';
COMMENT ON COLUMN fee_bills.month IS 'Month in YYYY-MM format (e.g., 2024-01)';
COMMENT ON COLUMN fee_payments.payment_mode IS 'Payment method: cash, cheque, online, bank_transfer';
COMMENT ON COLUMN fee_payments.transaction_id IS 'Optional transaction or idempotency key for a payment';
COMMENT ON COLUMN fee_payments.receipt_no IS 'Optional receipt number assigned to the payment';

-- Add comments only if columns exist
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'status') THEN
    COMMENT ON COLUMN previous_dues.status IS 'Status: pending or cleared';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'month') THEN
    COMMENT ON COLUMN previous_dues.month IS 'Month in YYYY-MM format (e.g., 2024-01)';
  END IF;
END $$;

-- =====================================================
-- VERIFICATION QUERIES (Optional - Run to check)
-- =====================================================
-- Uncomment below to verify tables were created:

-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN (
--   'fee_structures',
--   'fee_bills',
--   'fee_bill_items',
--   'fee_payments',
--   'previous_dues',
--   'month_closures'
-- )
-- ORDER BY table_name;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================
-- All tables created successfully!
-- You can now use the Fee Management APIs.

-- ============================================================
-- 8. migrations/007_create_advance_ledger_table.sql
-- ============================================================
-- Migration: Create Advance Ledger Table
-- Date: 2026-02-08
-- Description: Creates advance_ledger table to track advance payments

-- =====================================================
-- ADVANCE LEDGER TABLE
-- =====================================================
-- Tracks advance payments made by students
CREATE TABLE IF NOT EXISTS advance_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL,
  bill_id UUID, -- Optional: Bill ID if advance came from excess payment
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  payment_mode VARCHAR(50) NOT NULL, -- cash/cheque/online/bank_transfer
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  month VARCHAR(7), -- YYYY-MM format (month when advance was paid)
  year INT,
  status VARCHAR(20) DEFAULT 'active', -- active/used/refunded
  used_for_bill_id UUID, -- Bill ID where this advance was used
  used_at TIMESTAMP, -- When advance was used
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (bill_id) REFERENCES fee_bills(id) ON DELETE SET NULL,
  FOREIGN KEY (used_for_bill_id) REFERENCES fee_bills(id) ON DELETE SET NULL
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_advance_ledger_student ON advance_ledger(student_id);
CREATE INDEX IF NOT EXISTS idx_advance_ledger_bill ON advance_ledger(bill_id);
CREATE INDEX IF NOT EXISTS idx_advance_ledger_status ON advance_ledger(status);
CREATE INDEX IF NOT EXISTS idx_advance_ledger_student_status ON advance_ledger(student_id, status);
CREATE INDEX IF NOT EXISTS idx_advance_ledger_date ON advance_ledger(payment_date);

-- Comments for documentation
COMMENT ON TABLE advance_ledger IS 'Tracks advance payments made by students';
COMMENT ON COLUMN advance_ledger.status IS 'Status: active (available), used (applied to bill), refunded';
COMMENT ON COLUMN advance_ledger.bill_id IS 'Bill ID from which advance was generated (if from excess payment)';
COMMENT ON COLUMN advance_ledger.used_for_bill_id IS 'Bill ID where this advance was applied';


-- ============================================================
-- 9. migrations/008_create_migration_control_table.sql
-- ============================================================
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

-- ============================================================
-- 10. migrations/009_create_migration_logs_table.sql
-- ============================================================
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

-- ============================================================
-- 11. migrations/010_create_migration_function.sql
-- ============================================================
-- Migration: Create Migration Opening Balance Function
-- Date: 2026-03-21
-- Description: Creates PL/pgSQL function to migrate opening balance for each student

-- =====================================================
-- FUNCTION: fn_migrate_opening_balance_student
-- =====================================================
-- Migrates opening balance (pending due and advance) for a single student
-- Returns the amounts inserted for logging

CREATE OR REPLACE FUNCTION fn_migrate_opening_balance_student(
  p_student_id UUID,
  p_pending_due DECIMAL(10, 2),
  p_advance DECIMAL(10, 2),
  p_previous_month VARCHAR(7),
  p_migration_month VARCHAR(7)
)
RETURNS TABLE (
  pending_due_inserted DECIMAL(10, 2),
  advance_inserted DECIMAL(10, 2)
) AS $$
DECLARE
  v_pending_due_inserted DECIMAL(10, 2) := 0;
  v_advance_inserted DECIMAL(10, 2) := 0;
  v_migration_year INT;
BEGIN
  -- Extract years from months
  v_migration_year := CAST(SUBSTRING(p_migration_month, 1, 4) AS INT);

  -- NOTE: Pending due is NOT inserted into previous_dues table
  -- It will be included directly in fee_bills during bill generation
  -- This is by design - migration data goes directly to bills/bill_items only
  v_pending_due_inserted := p_pending_due;

  -- Insert advance if amount > 0
  IF p_advance > 0 THEN
    INSERT INTO advance_ledger (
      student_id,
      bill_id,
      amount,
      payment_mode,
      payment_date,
      month,
      year,
      status,
      created_at,
      updated_at
    ) VALUES (
      p_student_id,
      NULL,
      p_advance,
      'migration',
      CURRENT_DATE,
      p_migration_month,
      v_migration_year,
      'active',
      now(),
      now()
    );
    
    v_advance_inserted := p_advance;
  END IF;

  -- Return the inserted amounts
  RETURN QUERY SELECT v_pending_due_inserted, v_advance_inserted;

EXCEPTION WHEN OTHERS THEN
  -- Re-raise the exception with context
  RAISE EXCEPTION 'Error in fn_migrate_opening_balance_student: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON FUNCTION fn_migrate_opening_balance_student(UUID, DECIMAL, DECIMAL, VARCHAR, VARCHAR) 
IS 'Migrates opening balance (pending due and advance) for a single student to previous_dues and advance_ledger tables';

-- ============================================================
-- 12. migrations/011_fix_previous_dues_schema.sql
-- ============================================================
-- Migration: Fix Previous Dues Schema
-- Date: 2026-03-21
-- Description: Ensures previous_dues table has all required columns for migration

-- =====================================================
-- FIX PREVIOUS_DUES TABLE SCHEMA
-- =====================================================

-- Ensure amount column exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'previous_dues') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'amount') THEN
      ALTER TABLE previous_dues ADD COLUMN amount DECIMAL(10, 2) NOT NULL DEFAULT 0;
    END IF;
  END IF;
END $$;

-- Ensure month column exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'previous_dues') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'month') THEN
      ALTER TABLE previous_dues ADD COLUMN month VARCHAR(7);
    END IF;
  END IF;
END $$;

-- Ensure year column exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'previous_dues') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'year') THEN
      ALTER TABLE previous_dues ADD COLUMN year INT;
    END IF;
  END IF;
END $$;

-- Ensure status column exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'previous_dues') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'status') THEN
      ALTER TABLE previous_dues ADD COLUMN status VARCHAR(20) DEFAULT 'pending';
    END IF;
  END IF;
END $$;

-- Ensure created_at column exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'previous_dues') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'created_at') THEN
      ALTER TABLE previous_dues ADD COLUMN created_at TIMESTAMP DEFAULT now();
    END IF;
  END IF;
END $$;

-- Ensure updated_at column exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'previous_dues') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'updated_at') THEN
      ALTER TABLE previous_dues ADD COLUMN updated_at TIMESTAMP DEFAULT now();
    END IF;
  END IF;
END $$;

-- Verify columns exist with proper comments
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'amount') THEN
    COMMENT ON COLUMN previous_dues.amount IS 'Amount of previous due to be paid';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'status') THEN
    COMMENT ON COLUMN previous_dues.status IS 'Status: pending or cleared';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'month') THEN
    COMMENT ON COLUMN previous_dues.month IS 'Month in YYYY-MM format (e.g., 2024-01)';
  END IF;
END $$;

-- ============================================================
-- 13. migrations/012_rename_amount_to_remaining_dues.sql
-- ============================================================
-- Migration: Update previous_dues table schema
-- Date: 2026-03-21
-- Description: Rename amount to remaining_dues and add missing columns for proper tracking

-- Add remaining_dues column if it doesn't exist (rename from amount)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'previous_dues') THEN
    -- If amount column exists and remaining_dues doesn't, rename it
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'amount') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'remaining_dues') THEN
      ALTER TABLE previous_dues RENAME COLUMN amount TO remaining_dues;
    END IF;
    
    -- Add remaining_dues column if it still doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'remaining_dues') THEN
      ALTER TABLE previous_dues ADD COLUMN remaining_dues DECIMAL(10, 2) DEFAULT 0;
    END IF;
    
    -- Add original_due column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'original_due') THEN
      ALTER TABLE previous_dues ADD COLUMN original_due DECIMAL(10, 2) DEFAULT 0;
    END IF;
    
    -- Add remaining_due column if it doesn't exist (for backward compatibility)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'remaining_due') THEN
      ALTER TABLE previous_dues ADD COLUMN remaining_due DECIMAL(10, 2) DEFAULT 0;
    END IF;
    
    -- Add from_month column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'from_month') THEN
      ALTER TABLE previous_dues ADD COLUMN from_month VARCHAR(7);
    END IF;
    
    -- Add cleared column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'previous_dues' AND column_name = 'cleared') THEN
      ALTER TABLE previous_dues ADD COLUMN cleared BOOLEAN DEFAULT false;
    END IF;
  END IF;
END $$;

-- Update comment for clarity
COMMENT ON COLUMN previous_dues.remaining_dues IS 'Remaining dues amount to be paid';


-- ============================================================
-- 14. migrations/013_add_aadhaar_and_photo.sql
-- ============================================================
-- Migration: Add Aadhaar and Photo URL to students
-- Date: 2026-05-27
-- Description: Adds aadhaar_card (12-digit string) and photo_url (text) to students table

-- Add columns if they don't exist
ALTER TABLE IF EXISTS students
  ADD COLUMN IF NOT EXISTS aadhaar_card VARCHAR(12),
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Index to speed up lookups by aadhaar
CREATE INDEX IF NOT EXISTS idx_students_aadhaar ON students(aadhaar_card);

-- Comments
COMMENT ON COLUMN students.aadhaar_card IS '12 digit Aadhaar number for the student';
COMMENT ON COLUMN students.photo_url IS 'URL to student photo stored in Cloudinary or other provider';

-- ============================================================
-- 15. migrations/014_add_pen_number.sql
-- ============================================================
-- Migration: Add optional PEN number to students
-- Date: 2026-05-30
-- Description: Stores optional alphanumeric PEN value for student records.

ALTER TABLE IF EXISTS students
  ADD COLUMN IF NOT EXISTS pen_number VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_students_pen_number ON students(pen_number);

COMMENT ON COLUMN students.pen_number IS 'Optional alphanumeric PEN number for the student';

-- ============================================================
-- 16. migrations/015_create_holiday_calendar.sql
-- ============================================================
-- Holiday calendar range schema for Supabase/PostgreSQL.
-- Supports one admin holiday row for a full date range, for example 2026-06-20 to 2026-07-05.

create extension if not exists pgcrypto;

create table if not exists public.holiday_calendar (
  id uuid primary key default gen_random_uuid(),
  holiday_date date,
  start_date date not null default current_date,
  end_date date not null default current_date,
  title text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holiday_calendar_date_range_check check (end_date >= start_date)
);

alter table public.holiday_calendar
  add column if not exists holiday_date date,
  add column if not exists start_date date,
  add column if not exists end_date date;

alter table public.holiday_calendar
  alter column holiday_date drop not null;

update public.holiday_calendar
set
  start_date = coalesce(start_date, holiday_date, current_date),
  end_date = coalesce(end_date, holiday_date, start_date, current_date),
  holiday_date = coalesce(holiday_date, start_date, current_date)
where start_date is null
   or end_date is null
   or holiday_date is null;

alter table public.holiday_calendar
  alter column start_date set not null,
  alter column end_date set not null,
  alter column start_date set default current_date,
  alter column end_date set default current_date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'holiday_calendar_date_range_check'
      and conrelid = 'public.holiday_calendar'::regclass
  ) then
    alter table public.holiday_calendar
      add constraint holiday_calendar_date_range_check check (end_date >= start_date);
  end if;
end $$;

alter table public.holiday_calendar
  drop constraint if exists holiday_calendar_holiday_date_key;

drop index if exists public.holiday_calendar_holiday_date_key;
drop index if exists public.idx_holiday_calendar_unique_range_title;

delete from public.holiday_calendar a
using public.holiday_calendar b
where a.ctid < b.ctid
  and a.start_date = b.start_date
  and a.end_date = b.end_date
  and a.title = b.title;

create index if not exists idx_holiday_calendar_date
  on public.holiday_calendar (holiday_date);

create index if not exists idx_holiday_calendar_range
  on public.holiday_calendar (start_date, end_date);

create unique index if not exists idx_holiday_calendar_unique_range_title
  on public.holiday_calendar (start_date, end_date, title);

create or replace function public.set_holiday_calendar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.holiday_date = coalesce(new.holiday_date, new.start_date);
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_holiday_calendar_updated_at on public.holiday_calendar;
create trigger trg_holiday_calendar_updated_at
before insert or update on public.holiday_calendar
for each row execute function public.set_holiday_calendar_updated_at();

alter table public.holiday_calendar enable row level security;

grant all on table public.holiday_calendar to service_role;
grant select on table public.holiday_calendar to authenticated;

drop policy if exists "holiday_calendar_service_role_all" on public.holiday_calendar;
create policy "holiday_calendar_service_role_all"
on public.holiday_calendar
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- 17. docs_migrations/STUDENTS_ADMISSION_FIELDS_SETUP.sql
-- ============================================================
-- Student username / DOB setup for Supabase.
-- Run this in Supabase SQL Editor before using Username / DOB in student forms.

alter table public.students
  add column if not exists username text,
  add column if not exists date_of_birth date;

create unique index if not exists idx_students_username_unique
  on public.students (username)
  where username is not null and username <> '';

create index if not exists idx_students_date_of_birth
  on public.students (date_of_birth);

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');


-- ============================================================
-- 18. docs_migrations/TEACHER_ASSIGNMENTS_SETUP.sql
-- ============================================================
-- Teacher to class/section assignment setup for Supabase.
-- Run this in Supabase SQL Editor before using the teacher assignment UI.

create table if not exists public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class text not null,
  section text not null,
  academic_year text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_assignments_academic_year_format
    check (academic_year ~ '^\d{4}-(\d{2}|\d{4})$'),
  constraint teacher_assignments_unique_class_section_year
    unique (class, section, academic_year)
);

alter table public.teacher_assignments
  add column if not exists id uuid default gen_random_uuid();

update public.teacher_assignments
set id = gen_random_uuid()
where id is null;

alter table public.teacher_assignments
  alter column id set not null;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'teacher_assignments'
      and constraint_name = 'teacher_assignments_pkey'
  ) then
    alter table public.teacher_assignments
      drop constraint teacher_assignments_pkey;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'teacher_assignments'
      and constraint_name = 'teacher_assignments_pkey'
  ) then
    alter table public.teacher_assignments
      add constraint teacher_assignments_pkey primary key (id);
  end if;
end $$;

create index if not exists idx_teacher_assignments_class_section
  on public.teacher_assignments (class, section);

create index if not exists idx_teacher_assignments_teacher_id
  on public.teacher_assignments (teacher_id);

create or replace function public.set_teacher_assignments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_teacher_assignments_updated_at on public.teacher_assignments;
create trigger trg_teacher_assignments_updated_at
before update on public.teacher_assignments
for each row
execute function public.set_teacher_assignments_updated_at();

alter table public.teacher_assignments enable row level security;

drop policy if exists "teacher_assignments_service_role_all" on public.teacher_assignments;
create policy "teacher_assignments_service_role_all"
on public.teacher_assignments
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- ============================================================
-- 19. docs_migrations/ALLOW_MULTI_TEACHER_ASSIGNMENTS.sql
-- ============================================================
-- Allow one teacher to be assigned to multiple class/section/year rows.
-- Run this once in Supabase SQL Editor if teacher_assignments was created with teacher_id as primary key.

create extension if not exists pgcrypto;

alter table public.teacher_assignments
  add column if not exists id uuid default gen_random_uuid();

update public.teacher_assignments
set id = gen_random_uuid()
where id is null;

alter table public.teacher_assignments
  alter column id set not null;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'teacher_assignments'
      and constraint_name = 'teacher_assignments_pkey'
  ) then
    alter table public.teacher_assignments
      drop constraint teacher_assignments_pkey;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'teacher_assignments'
      and constraint_name = 'teacher_assignments_pkey'
  ) then
    alter table public.teacher_assignments
      add constraint teacher_assignments_pkey primary key (id);
  end if;
end $$;

create unique index if not exists teacher_assignments_unique_class_section_year_idx
  on public.teacher_assignments (class, section, academic_year);

create index if not exists idx_teacher_assignments_teacher_id
  on public.teacher_assignments (teacher_id);

-- ============================================================
-- 20. ATTENDANCE_SYSTEM_DOCUMENT.md SQL block
-- ============================================================
-- Attendance system schema for Supabase.
-- Includes teacher assignment, student login mapping, and attendance records.

create extension if not exists pgcrypto;

create table if not exists public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class text not null,
  section text not null,
  academic_year text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_assignments_academic_year_format
    check (academic_year ~ '^\d{4}-(\d{2}|\d{4})$'),
  constraint teacher_assignments_unique_class_section_year
    unique (class, section, academic_year)
);

create table if not exists public.student_auth (
  student_id uuid primary key references public.students(id) on delete cascade,
  username text not null unique,
  password_hash text not null,
  is_active boolean not null default true,
  must_reset_password boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.student_auth
  add column if not exists must_reset_password boolean not null default true;

update public.student_auth
set must_reset_password = coalesce(must_reset_password, true);

comment on column public.student_auth.must_reset_password
  is 'Whether student must set a new password after first DOB login';

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  attendance_date date not null,
  student_id uuid not null references public.students(id) on delete cascade,
  class text not null,
  section text not null,
  academic_year text not null,
  status text not null,
  marked_by uuid references auth.users(id) on delete set null,
  marked_by_role text,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint attendance_status_check
    check (status in ('present', 'absent', 'late', 'holiday')),
  constraint attendance_academic_year_format
    check (academic_year ~ '^\d{4}-(\d{2}|\d{4})$'),
  constraint attendance_unique_student_date
    unique (student_id, attendance_date)
);

create table if not exists public.holiday_calendar (
  id uuid primary key default gen_random_uuid(),
  holiday_date date,
  start_date date not null default current_date,
  end_date date not null default current_date,
  title text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holiday_calendar_date_range_check check (end_date >= start_date)
);

create index if not exists idx_teacher_assignments_class_section_year
  on public.teacher_assignments (class, section, academic_year);

create index if not exists idx_student_auth_username
  on public.student_auth (username);

create index if not exists idx_attendance_date
  on public.attendance_records (attendance_date);

create index if not exists idx_attendance_student
  on public.attendance_records (student_id);

create index if not exists idx_attendance_class_section_date
  on public.attendance_records (class, section, attendance_date);

create index if not exists idx_attendance_academic_year
  on public.attendance_records (academic_year);

create index if not exists idx_holiday_calendar_date
  on public.holiday_calendar (holiday_date);

create index if not exists idx_holiday_calendar_range
  on public.holiday_calendar (start_date, end_date);

create unique index if not exists idx_holiday_calendar_unique_range_title
  on public.holiday_calendar (start_date, end_date, title);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_holiday_calendar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.holiday_date = coalesce(new.holiday_date, new.start_date);
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_teacher_assignments_updated_at on public.teacher_assignments;
create trigger trg_teacher_assignments_updated_at
before update on public.teacher_assignments
for each row execute function public.set_updated_at();

drop trigger if exists trg_student_auth_updated_at on public.student_auth;
create trigger trg_student_auth_updated_at
before update on public.student_auth
for each row execute function public.set_updated_at();

drop trigger if exists trg_attendance_records_updated_at on public.attendance_records;
create trigger trg_attendance_records_updated_at
before update on public.attendance_records
for each row execute function public.set_updated_at();

drop trigger if exists trg_holiday_calendar_updated_at on public.holiday_calendar;
create trigger trg_holiday_calendar_updated_at
before update on public.holiday_calendar
for each row execute function public.set_holiday_calendar_updated_at();

alter table public.teacher_assignments enable row level security;
alter table public.student_auth enable row level security;
alter table public.attendance_records enable row level security;
alter table public.holiday_calendar enable row level security;

drop policy if exists "teacher_assignments_service_role_all" on public.teacher_assignments;
create policy "teacher_assignments_service_role_all"
on public.teacher_assignments
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "student_auth_service_role_all" on public.student_auth;
create policy "student_auth_service_role_all"
on public.student_auth
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "attendance_records_service_role_all" on public.attendance_records;
create policy "attendance_records_service_role_all"
on public.attendance_records
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "holiday_calendar_service_role_all" on public.holiday_calendar;
create policy "holiday_calendar_service_role_all"
on public.holiday_calendar
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- ============================================================
-- 21. docs_migrations/HOLIDAY_CALENDAR_SETUP.sql
-- ============================================================
-- Holiday calendar setup for Supabase.
-- Run this in Supabase SQL Editor before using admin holiday calendar UI.

create extension if not exists pgcrypto;

create table if not exists public.holiday_calendar (
  id uuid primary key default gen_random_uuid(),
  -- holiday_date is kept for old code compatibility; start_date/end_date are the source of truth.
  holiday_date date,
  start_date date not null default current_date,
  end_date date not null default current_date,
  title text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holiday_calendar_date_range_check check (end_date >= start_date)
);

alter table public.holiday_calendar
  add column if not exists holiday_date date,
  add column if not exists start_date date,
  add column if not exists end_date date;

alter table public.holiday_calendar
  alter column holiday_date drop not null;

update public.holiday_calendar
set
  start_date = coalesce(start_date, holiday_date, current_date),
  end_date = coalesce(end_date, holiday_date, start_date, current_date),
  holiday_date = coalesce(holiday_date, start_date, current_date)
where start_date is null
   or end_date is null
   or holiday_date is null;

alter table public.holiday_calendar
  alter column start_date set not null,
  alter column end_date set not null,
  alter column start_date set default current_date,
  alter column end_date set default current_date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'holiday_calendar_date_range_check'
      and conrelid = 'public.holiday_calendar'::regclass
  ) then
    alter table public.holiday_calendar
      add constraint holiday_calendar_date_range_check check (end_date >= start_date);
  end if;
end $$;

alter table public.holiday_calendar
  drop constraint if exists holiday_calendar_holiday_date_key;

drop index if exists public.holiday_calendar_holiday_date_key;
drop index if exists public.idx_holiday_calendar_unique_range_title;

delete from public.holiday_calendar a
using public.holiday_calendar b
where a.ctid < b.ctid
  and a.start_date = b.start_date
  and a.end_date = b.end_date
  and a.title = b.title;

create index if not exists idx_holiday_calendar_date
  on public.holiday_calendar (holiday_date);

create index if not exists idx_holiday_calendar_range
  on public.holiday_calendar (start_date, end_date);

create unique index if not exists idx_holiday_calendar_unique_range_title
  on public.holiday_calendar (start_date, end_date, title);

create or replace function public.set_holiday_calendar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.holiday_date = coalesce(new.holiday_date, new.start_date);
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_holiday_calendar_updated_at on public.holiday_calendar;
create trigger trg_holiday_calendar_updated_at
before insert or update on public.holiday_calendar
for each row execute function public.set_holiday_calendar_updated_at();

alter table public.holiday_calendar enable row level security;

grant all on table public.holiday_calendar to service_role;
grant select on table public.holiday_calendar to authenticated;

drop policy if exists "holiday_calendar_service_role_all" on public.holiday_calendar;
create policy "holiday_calendar_service_role_all"
on public.holiday_calendar
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- Refresh Supabase/PostgREST schema cache so API can see the new table quickly.
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- Quick verification:
-- select to_regclass('public.holiday_calendar') as holiday_calendar_table;
-- select count(*) from public.holiday_calendar;

-- ============================================================
-- 22. docs_migrations/RENAME_MOTHER_CARE_TO_NURSERY.sql
-- ============================================================
-- Skipped here because it is a data update utility, not base schema.

-- ============================================================
-- 23. docs_migrations/SEED_STUDENTS_ALL_CLASSES.sql
-- ============================================================
-- Skipped here because it inserts demo data.

-- Refresh Supabase/PostgREST schema cache after all changes.
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- 24. docs_migrations/TEACHER_GPS_ATTENDANCE_MODULE.sql
-- ============================================================
-- Teacher Management & GPS Attendance Module
-- Run this in Supabase SQL editor before using /api/teacher-attendance.

do $$ begin
  create type teacher_attendance_status as enum (
    'present_provisional',
    'present',
    'late',
    'half_day',
    'absent',
    'leave',
    'holiday',
    'checkout_missing',
    'rejected'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.teacher_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id text unique,
  full_name text not null default '',
  mobile text,
  email text,
  gender text,
  date_of_birth date,
  qualification text,
  designation text,
  department text,
  joining_date date,
  address text,
  emergency_contact text,
  photo_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  username text unique,
  must_reset_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

create table if not exists public.teacher_attendance_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid,
  school_name text not null default 'Star Public School',
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  radius_meters integer not null default 150 check (radius_meters > 0),
  gps_accuracy_meters integer not null default 80 check (gps_accuracy_meters > 0),
  school_start_time time not null default '07:00',
  school_end_time time not null default '13:00',
  grace_minutes integer not null default 15 check (grace_minutes >= 0),
  checkout_deadline time not null default '14:00',
  minimum_working_minutes integer not null default 180 check (minimum_working_minutes >= 0),
  late_after_minutes integer not null default 15 check (late_after_minutes >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create unique index if not exists teacher_attendance_settings_one_active
on public.teacher_attendance_settings ((is_active))
where is_active = true;

create table if not exists public.teacher_attendance_records (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete restrict,
  school_id uuid,
  attendance_date date not null,
  status teacher_attendance_status not null default 'present_provisional',
  check_in_at timestamptz,
  check_in_latitude numeric(10,7),
  check_in_longitude numeric(10,7),
  check_in_accuracy numeric(8,2),
  check_in_distance_meters numeric(10,2),
  check_out_at timestamptz,
  check_out_latitude numeric(10,7),
  check_out_longitude numeric(10,7),
  check_out_accuracy numeric(8,2),
  check_out_distance_meters numeric(10,2),
  working_minutes integer not null default 0,
  device_id text,
  checkout_missing_reason text,
  checkout_missing_remarks text,
  checkout_request_status text not null default 'none' check (checkout_request_status in ('none', 'pending', 'approved', 'rejected')),
  admin_remarks text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  unique (teacher_id, attendance_date)
);

create index if not exists teacher_attendance_records_date_idx
on public.teacher_attendance_records (attendance_date desc);

create index if not exists teacher_attendance_records_teacher_date_idx
on public.teacher_attendance_records (teacher_id, attendance_date desc);

create index if not exists teacher_attendance_records_status_idx
on public.teacher_attendance_records (status);

create table if not exists public.teacher_leave_requests (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete restrict,
  leave_type text not null,
  from_date date not null,
  to_date date not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_remarks text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  check (to_date >= from_date)
);

create index if not exists teacher_leave_requests_teacher_date_idx
on public.teacher_leave_requests (teacher_id, from_date desc, to_date desc);

create index if not exists teacher_leave_requests_status_idx
on public.teacher_leave_requests (status);

create table if not exists public.teacher_attendance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid,
  attendance_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor_id uuid,
  actor_role text,
  created_at timestamptz not null default now()
);

create index if not exists teacher_attendance_audit_teacher_idx
on public.teacher_attendance_audit_logs (teacher_id, created_at desc);

create index if not exists teacher_attendance_audit_attendance_idx
on public.teacher_attendance_audit_logs (attendance_id, created_at desc);

create table if not exists public.teacher_notifications (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists teacher_notifications_teacher_idx
on public.teacher_notifications (teacher_id, is_read, created_at desc);

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- 25. migrations/016_teacher_attendance_rls_policies.sql
-- ============================================================
-- Teacher attendance RLS setup
-- Run after the teacher attendance module tables already exist.

alter table public.teacher_profiles enable row level security;
alter table public.teacher_attendance_settings enable row level security;
alter table public.teacher_attendance_records enable row level security;
alter table public.teacher_leave_requests enable row level security;
alter table public.teacher_attendance_audit_logs enable row level security;
alter table public.teacher_notifications enable row level security;

drop policy if exists "teacher_profiles_service_role_all" on public.teacher_profiles;
create policy "teacher_profiles_service_role_all"
on public.teacher_profiles
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "teacher_attendance_settings_service_role_all" on public.teacher_attendance_settings;
create policy "teacher_attendance_settings_service_role_all"
on public.teacher_attendance_settings
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "teacher_attendance_records_service_role_all" on public.teacher_attendance_records;
create policy "teacher_attendance_records_service_role_all"
on public.teacher_attendance_records
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "teacher_leave_requests_service_role_all" on public.teacher_leave_requests;
create policy "teacher_leave_requests_service_role_all"
on public.teacher_leave_requests
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "teacher_attendance_audit_logs_service_role_all" on public.teacher_attendance_audit_logs;
create policy "teacher_attendance_audit_logs_service_role_all"
on public.teacher_attendance_audit_logs
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "teacher_notifications_service_role_all" on public.teacher_notifications;
create policy "teacher_notifications_service_role_all"
on public.teacher_notifications
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- ============================================================
-- 26. docs_migrations/021_add_student_push_notifications.sql
-- ============================================================
-- Student push notification support for bill generation and payment alerts.

create extension if not exists pgcrypto;

create table if not exists public.student_push_tokens (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  push_token text not null unique,
  platform text,
  device_id text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_push_tokens_student_id
  on public.student_push_tokens (student_id);

create index if not exists idx_student_push_tokens_active
  on public.student_push_tokens (student_id, is_active, last_seen_at desc);

create table if not exists public.student_notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  notification_type text not null default 'general',
  source_type text,
  source_id uuid,
  title text not null,
  body text not null,
  notification_data jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'queued',
  is_read boolean not null default false,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_notifications_student_created
  on public.student_notifications (student_id, created_at desc);

create index if not exists idx_student_notifications_student_read
  on public.student_notifications (student_id, is_read, created_at desc);

create index if not exists idx_student_notifications_source
  on public.student_notifications (source_type, source_id);

alter table public.student_push_tokens enable row level security;
alter table public.student_notifications enable row level security;

grant all on table public.student_push_tokens to service_role;
grant all on table public.student_notifications to service_role;

drop policy if exists "student_push_tokens_service_role_all" on public.student_push_tokens;
create policy "student_push_tokens_service_role_all"
on public.student_push_tokens
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "student_notifications_service_role_all" on public.student_notifications;
create policy "student_notifications_service_role_all"
on public.student_notifications
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
