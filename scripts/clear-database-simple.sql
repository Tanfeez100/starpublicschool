-- =====================================================
-- SIMPLE DATABASE CLEAR SCRIPT
-- =====================================================
-- Copy-paste this in Supabase SQL Editor
-- =====================================================

-- Clear all data (keeps admin/teacher login)

DELETE FROM marks;
DELETE FROM result_summary;
DELETE FROM class_subjects;
DELETE FROM subjects;
DELETE FROM fees;
DELETE FROM previous_dues;
DELETE FROM fee_structure;
DELETE FROM students;

-- Done! All data cleared except auth.users and user_roles

