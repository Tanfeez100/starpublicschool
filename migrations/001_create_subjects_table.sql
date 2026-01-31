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
  status VARCHAR(20),
  calculated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE(student_id, terminal)
);

CREATE INDEX IF NOT EXISTS idx_result_summary_student ON result_summary(student_id);
