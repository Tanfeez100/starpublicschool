-- Add section column to class_subjects table
ALTER TABLE class_subjects 
ADD COLUMN IF NOT EXISTS section VARCHAR(10);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_class_subjects_class_section ON class_subjects(class, section);

-- Update unique constraint to include section (optional - uncomment if needed)
-- ALTER TABLE class_subjects DROP CONSTRAINT IF EXISTS class_subjects_class_subject_id_key;
-- ALTER TABLE class_subjects ADD CONSTRAINT class_subjects_class_section_subject_id_key UNIQUE(class, section, subject_id);

