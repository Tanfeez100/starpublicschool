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

-- M.C to LKG subjects mapping
INSERT INTO class_subjects (class, subject_id, sequence) 
SELECT 'Mother Care', id, row_number() OVER (ORDER BY code) FROM subjects 
WHERE code IN ('HND', 'HNW', 'ENG', 'ENW', 'MTH', 'DRW')
ON CONFLICT DO NOTHING;

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
