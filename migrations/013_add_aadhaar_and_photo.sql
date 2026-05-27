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
