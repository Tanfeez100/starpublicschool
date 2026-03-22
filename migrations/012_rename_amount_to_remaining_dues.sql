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

