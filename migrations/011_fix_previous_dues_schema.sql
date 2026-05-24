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
