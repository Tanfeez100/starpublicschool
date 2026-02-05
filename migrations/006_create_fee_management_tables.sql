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
  created_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (bill_id) REFERENCES fee_bills(id) ON DELETE CASCADE
);

-- Indexes for faster payment queries
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_bill ON fee_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_date ON fee_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student_bill ON fee_payments(student_id, bill_id);

-- =====================================================
-- 5. PREVIOUS DUES TABLE
-- =====================================================
-- Previous month dues carried forward
-- Check if table exists, if not create it
CREATE TABLE IF NOT EXISTS previous_dues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  month VARCHAR(7) NOT NULL, -- YYYY-MM format
  year INT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending/cleared
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
