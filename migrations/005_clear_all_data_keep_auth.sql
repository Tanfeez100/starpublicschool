-- =====================================================
-- CLEAR ALL DATA - KEEP ADMIN & TEACHER LOGIN
-- =====================================================
-- This script deletes all data from the database
-- while preserving admin and teacher authentication
-- 
-- WARNING: This will delete ALL data except user authentication!
-- Run this only when you want to start fresh.
-- =====================================================

-- Disable foreign key checks temporarily (if needed)
-- Note: Supabase/PostgreSQL handles CASCADE automatically

-- 1. Delete all marks data
DELETE FROM marks;
-- Reset sequence if exists
-- ALTER SEQUENCE marks_id_seq RESTART WITH 1;

-- 2. Delete all result summaries
DELETE FROM result_summary;
-- ALTER SEQUENCE result_summary_id_seq RESTART WITH 1;

-- 3. Delete all class-subject mappings
DELETE FROM class_subjects;
-- ALTER SEQUENCE class_subjects_id_seq RESTART WITH 1;

-- 4. Delete all subjects (master list)
-- NOTE: If you want to keep subject master data, comment out this line
DELETE FROM subjects;
-- ALTER SEQUENCE subjects_id_seq RESTART WITH 1;

-- 5. Delete all fees data
DELETE FROM fees;
-- ALTER SEQUENCE fees_id_seq RESTART WITH 1;

-- 6. Delete all previous dues
DELETE FROM previous_dues;
-- ALTER SEQUENCE previous_dues_id_seq RESTART WITH 1;

-- 7. Delete fee structure (optional - comment out if you want to keep fee structure)
DELETE FROM fee_structure;
-- ALTER SEQUENCE fee_structure_id_seq RESTART WITH 1;

-- 8. Delete all students
DELETE FROM students;
-- ALTER SEQUENCE students_id_seq RESTART WITH 1;

-- =====================================================
-- PRESERVED TABLES (NOT DELETED):
-- =====================================================
-- ✅ auth.users - Supabase authentication (KEPT)
-- ✅ user_roles - Admin/Teacher roles (KEPT)
-- =====================================================

-- Verify what's left (optional check)
-- SELECT COUNT(*) as remaining_users FROM auth.users;
-- SELECT COUNT(*) as remaining_roles FROM user_roles;

-- =====================================================
-- DONE! All data cleared except authentication.
-- =====================================================

