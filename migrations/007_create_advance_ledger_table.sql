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

