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
