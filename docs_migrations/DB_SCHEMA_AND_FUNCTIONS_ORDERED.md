# DB Schema and Functions - First to Last

This document collects the database schema files and database functions used by
the project in execution order. Use this as the ordered map before running or
checking Supabase SQL changes.

## Source Order

Run or review the numbered migrations first, then the setup SQL files that were
kept under `docs_migrations`.

0. `docs_migrations/ALL_SCHEMA_MIGRATION_IN_ORDER.sql` base compatibility block for `students`, `user_roles`, legacy `fees`, and legacy `fee_structure`
1. `migrations/001_create_subjects_table.sql`
2. `migrations/002_create_user_sessions.sql`
3. `migrations/002_seed_subjects_and_curriculum.sql`
4. `migrations/003_add_optional_fees_and_advance.sql`
5. `migrations/004_add_section_to_class_subjects.sql`
6. `migrations/005_clear_all_data_keep_auth.sql` - destructive utility, not a normal migration
7. `migrations/006_create_fee_management_tables.sql`
8. `migrations/007_create_advance_ledger_table.sql`
9. `migrations/008_create_migration_control_table.sql`
10. `migrations/009_create_migration_logs_table.sql`
11. `migrations/010_create_migration_function.sql`
12. `migrations/011_fix_previous_dues_schema.sql`
13. `migrations/012_rename_amount_to_remaining_dues.sql`
14. `migrations/013_add_aadhaar_and_photo.sql`
15. `migrations/014_add_pen_number.sql`
16. `migrations/015_create_holiday_calendar.sql`
17. `docs_migrations/STUDENTS_ADMISSION_FIELDS_SETUP.sql`
18. `docs_migrations/TEACHER_ASSIGNMENTS_SETUP.sql`
19. `docs_migrations/ALLOW_MULTI_TEACHER_ASSIGNMENTS.sql`
20. `docs_migrations/ATTENDANCE_SYSTEM_DOCUMENT.md` SQL block for `student_auth` and `attendance_records`
21. `docs_migrations/HOLIDAY_CALENDAR_SETUP.sql` - same schema as migration 015, kept for Supabase SQL Editor setup
22. `docs_migrations/RENAME_MOTHER_CARE_TO_NURSERY.sql` - data update utility
23. `docs_migrations/SEED_STUDENTS_ALL_CLASSES.sql` - demo data seed utility
24. `docs_migrations/TEACHER_GPS_ATTENDANCE_MODULE.sql`
25. `migrations/016_teacher_attendance_rls_policies.sql`

## Chronological Schema

### 1. Result and Subject Schema

Source: `migrations/001_create_subjects_table.sql`

Tables:

- `subjects`
  - `id uuid primary key default uuid_generate_v4()`
  - `name varchar(50) not null unique`
  - `code varchar(10) not null unique`
  - `max_external_marks int default 80`
  - `max_internal_marks int default 20`
  - `created_at timestamp default now()`
  - `updated_at timestamp default now()`

- `class_subjects`
  - `id uuid primary key default uuid_generate_v4()`
  - `class varchar(20) not null`
  - `subject_id uuid not null references subjects(id) on delete cascade`
  - `sequence int`
  - `created_at timestamp default now()`
  - unique: `(class, subject_id)`

- `marks`
  - `id uuid primary key default uuid_generate_v4()`
  - `student_id uuid not null references students(id) on delete cascade`
  - `subject_id uuid not null references subjects(id) on delete cascade`
  - `terminal varchar(20) not null`
  - `external_marks decimal(5,2)`
  - `internal_marks decimal(5,2)`
  - `status varchar(20) default 'PENDING'`
  - `created_at timestamp default now()`
  - `updated_at timestamp default now()`
  - unique: `(student_id, subject_id, terminal)`

- `result_summary`
  - `id uuid primary key default uuid_generate_v4()`
  - `student_id uuid not null references students(id) on delete cascade`
  - `terminal varchar(20) not null`
  - `total_marks decimal(7,2)`
  - `total_obtained decimal(7,2)`
  - `percentage decimal(5,2)`
  - `division varchar(20)`
  - `rank int`
  - `status varchar(20)`
  - `calculated_at timestamp default now()`
  - unique: `(student_id, terminal)`

Indexes:

- `idx_marks_student`
- `idx_marks_terminal`
- `idx_marks_student_terminal`
- `idx_class_subjects_class`
- `idx_result_summary_student`

### 2. User Session Schema

Source: `migrations/002_create_user_sessions.sql`

Table:

- `user_sessions`
  - `id uuid primary key default uuid_generate_v4()`
  - `user_id uuid not null`
  - `token_hash varchar(255) not null unique`
  - `access_token text not null`
  - `is_active boolean default true`
  - `created_at timestamp default now()`
  - `expires_at timestamp not null`

Indexes:

- `idx_user_sessions_token_hash`
- `idx_user_sessions_user_id`
- `idx_user_sessions_active`

Function:

- `cleanup_expired_sessions() returns void`
  - Deletes rows from `user_sessions` where `expires_at < now()` or `is_active = false`.

### 3. Subject Seed and Curriculum

Source: `migrations/002_seed_subjects_and_curriculum.sql`

Data inserted:

- `subjects`: Hindi, Hindi Writing, English, English Writing, Math, Drawing, EVS, General Knowledge, Sanskrit, Urdu, Computer, Science, Social Studies.
- `class_subjects`: class-wise mappings for Mother Care, Nursery, LKG, UKG, and classes 1 to 8.

### 4. Optional Fees and Student Transport

Source: `migrations/003_add_optional_fees_and_advance.sql`

Changes:

- `students.uses_transport boolean default false`
- `fees.transport_fee decimal(10,2) default 0`
- `fees.exam_fee decimal(10,2) default 0`
- `fees.annual_fee decimal(10,2) default 0`
- `fees.advance decimal(10,2) default 0`
- `fees.fine decimal(10,2) default 0`

Indexes:

- `idx_students_class`
- `idx_fees_student_month`

### 5. Class Subject Section

Source: `migrations/004_add_section_to_class_subjects.sql`

Change:

- `class_subjects.section varchar(10)`

Index:

- `idx_class_subjects_class_section`

### 6. Clear Data Utility

Source: `migrations/005_clear_all_data_keep_auth.sql`

This is not a normal schema migration. It deletes data from:

- `marks`
- `result_summary`
- `class_subjects`
- `subjects`
- `fees`
- `previous_dues`
- `fee_structure`
- `students`

Preserved:

- `auth.users`
- `user_roles`

### 7. Fee Management Schema

Source: `migrations/006_create_fee_management_tables.sql`

Tables:

- `fee_structures`
  - `id uuid primary key default uuid_generate_v4()`
  - `class varchar(20) not null`
  - `section varchar(20)`
  - `fee_name varchar(100) not null`
  - `fee_amount decimal(10,2) not null default 0`
  - `is_optional boolean default false`
  - `created_at timestamp default now()`
  - `updated_at timestamp default now()`

- `fee_bills`
  - `id uuid primary key default uuid_generate_v4()`
  - `student_id uuid not null references students(id) on delete cascade`
  - `month varchar(7) not null`
  - `year int not null`
  - `total_amount decimal(10,2) not null default 0`
  - `bill_status varchar(20) default 'unpaid'`
  - `created_at timestamp default now()`
  - `updated_at timestamp default now()`
  - unique: `(student_id, month)`

- `fee_bill_items`
  - `id uuid primary key default uuid_generate_v4()`
  - `bill_id uuid not null references fee_bills(id) on delete cascade`
  - `fee_name varchar(100) not null`
  - `amount decimal(10,2) not null default 0`
  - `created_at timestamp default now()`

- `fee_payments`
  - `id uuid primary key default uuid_generate_v4()`
  - `student_id uuid not null references students(id) on delete cascade`
  - `bill_id uuid not null references fee_bills(id) on delete cascade`
  - `amount_paid decimal(10,2) not null default 0`
  - `payment_mode varchar(50) not null`
  - `payment_date date not null default current_date`
  - `created_at timestamp default now()`

- `previous_dues`
  - `id uuid primary key default uuid_generate_v4()`
  - `student_id uuid not null references students(id) on delete cascade`
  - `remaining_dues decimal(10,2) not null default 0`
  - `original_due decimal(10,2) default 0`
  - `remaining_due decimal(10,2) default 0`
  - `from_month varchar(7)`
  - `month varchar(7) not null`
  - `year int not null`
  - `status varchar(20) default 'pending'`
  - `cleared boolean default false`
  - `created_at timestamp default now()`
  - `updated_at timestamp default now()`

- `month_closures`
  - `id uuid primary key default uuid_generate_v4()`
  - `month varchar(7) not null unique`
  - `year int not null`
  - `closed_by uuid references auth.users(id) on delete set null`
  - `closed_at timestamp default now()`

Indexes:

- `idx_fee_structures_class_section`
- `idx_fee_structures_class`
- `idx_fee_structures_fee_name`
- `idx_fee_bills_student`
- `idx_fee_bills_month`
- `idx_fee_bills_year`
- `idx_fee_bills_status`
- `idx_fee_bills_student_month`
- `idx_fee_bill_items_bill`
- `idx_fee_payments_student`
- `idx_fee_payments_bill`
- `idx_fee_payments_date`
- `idx_fee_payments_student_bill`
- `idx_previous_dues_student`
- `idx_previous_dues_month`
- `idx_previous_dues_status`
- `idx_previous_dues_student_month`
- `idx_month_closures_month`
- `idx_month_closures_year`

### 8. Advance Ledger

Source: `migrations/007_create_advance_ledger_table.sql`

Table:

- `advance_ledger`
  - `id uuid primary key default uuid_generate_v4()`
  - `student_id uuid not null references students(id) on delete cascade`
  - `bill_id uuid references fee_bills(id) on delete set null`
  - `amount decimal(10,2) not null default 0`
  - `payment_mode varchar(50) not null`
  - `payment_date date not null default current_date`
  - `month varchar(7)`
  - `year int`
  - `status varchar(20) default 'active'`
  - `used_for_bill_id uuid references fee_bills(id) on delete set null`
  - `used_at timestamp`
  - `created_at timestamp default now()`
  - `updated_at timestamp default now()`

Indexes:

- `idx_advance_ledger_student`
- `idx_advance_ledger_bill`
- `idx_advance_ledger_status`
- `idx_advance_ledger_student_status`
- `idx_advance_ledger_date`

### 9. Opening Balance Migration Control

Source: `migrations/008_create_migration_control_table.sql`

Table:

- `migration_control`
  - `migration_month varchar(7) primary key`
  - `is_completed boolean default false`
  - `created_at timestamp default now()`
  - `updated_at timestamp default now()`

Index:

- `idx_migration_control_completed`

### 10. Opening Balance Migration Logs

Source: `migrations/009_create_migration_logs_table.sql`

Table:

- `migration_logs`
  - `id uuid primary key default uuid_generate_v4()`
  - `student_id uuid`
  - `roll_no int not null`
  - `pending_due_inserted decimal(10,2) default 0`
  - `advance_inserted decimal(10,2) default 0`
  - `status varchar(50) default 'PENDING'`
  - `error text`
  - `created_at timestamp default now()`
  - `updated_at timestamp default now()`

Indexes:

- `idx_migration_logs_student_id`
- `idx_migration_logs_roll_no`
- `idx_migration_logs_status`
- `idx_migration_logs_created_at`

### 11. Opening Balance Migration Function

Source: `migrations/010_create_migration_function.sql`

Function:

- `fn_migrate_opening_balance_student(p_student_id uuid, p_pending_due decimal, p_advance decimal, p_previous_month varchar, p_migration_month varchar)`
  - Returns table: `pending_due_inserted decimal`, `advance_inserted decimal`.
  - Pending due is returned for logging/bill handling.
  - Positive advance is inserted into `advance_ledger` as `status = 'active'` and `payment_mode = 'migration'`.

### 12. Previous Dues Compatibility Fix

Source: `migrations/011_fix_previous_dues_schema.sql`

Ensures `previous_dues` has:

- `amount decimal(10,2) not null default 0`
- `month varchar(7)`
- `year int`
- `status varchar(20) default 'pending'`
- `created_at timestamp default now()`
- `updated_at timestamp default now()`

### 13. Previous Dues Remaining Amount Rename

Source: `migrations/012_rename_amount_to_remaining_dues.sql`

Changes:

- Renames `previous_dues.amount` to `previous_dues.remaining_dues` when possible.
- Ensures `remaining_dues decimal(10,2) default 0`.
- Ensures `original_due decimal(10,2) default 0`.
- Ensures `remaining_due decimal(10,2) default 0` for backward compatibility.
- Ensures `from_month varchar(7)`.
- Ensures `cleared boolean default false`.

### 14. Student Aadhaar and Photo

Source: `migrations/013_add_aadhaar_and_photo.sql`

Changes:

- `students.aadhaar_card varchar(12)`
- `students.photo_url text`

Index:

- `idx_students_aadhaar`

### 15. Student PEN Number

Source: `migrations/014_add_pen_number.sql`

Change:

- `students.pen_number varchar(32)`

Index:

- `idx_students_pen_number`

### 16. Holiday Calendar

Source: `migrations/015_create_holiday_calendar.sql`

Table:

- `holiday_calendar`
  - `id uuid primary key default gen_random_uuid()`
  - `holiday_date date`
  - `start_date date not null default current_date`
  - `end_date date not null default current_date`
  - `title text not null`
  - `description text`
  - `created_by uuid references auth.users(id) on delete set null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
  - check: `end_date >= start_date`

Indexes:

- `idx_holiday_calendar_date`
- `idx_holiday_calendar_range`
- `idx_holiday_calendar_unique_range_title` unique on `(start_date, end_date, title)`

Function and trigger:

- `set_holiday_calendar_updated_at() returns trigger`
  - Sets `holiday_date = coalesce(holiday_date, start_date)`.
  - Sets `updated_at = now()`.
- Trigger: `trg_holiday_calendar_updated_at` before insert or update.

Security:

- RLS enabled.
- Service role has full access policy.
- Authenticated users get select grant.

### 17. Student Admission Fields

Source: `docs_migrations/STUDENTS_ADMISSION_FIELDS_SETUP.sql`

Changes:

- `students.admission_number text`
- `students.admission_date date`

Indexes:

- `idx_students_admission_number_unique` unique where admission number is present.
- `idx_students_admission_date`

### 18. Teacher Assignments

Source: `docs_migrations/TEACHER_ASSIGNMENTS_SETUP.sql`

Table:

- `teacher_assignments`
  - `id uuid primary key default gen_random_uuid()`
  - `teacher_id uuid not null references auth.users(id) on delete cascade`
  - `class text not null`
  - `section text not null`
  - `academic_year text not null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
  - check: academic year format `YYYY-YY` or `YYYY-YYYY`
  - unique: `(class, section, academic_year)`

Indexes:

- `idx_teacher_assignments_class_section`
- `idx_teacher_assignments_teacher_id`

Function and trigger:

- `set_teacher_assignments_updated_at() returns trigger`
  - Sets `updated_at = now()`.
- Trigger: `trg_teacher_assignments_updated_at` before update.

Security:

- RLS enabled.
- Service role has full access policy.

### 19. Multi Teacher Assignment Compatibility

Source: `docs_migrations/ALLOW_MULTI_TEACHER_ASSIGNMENTS.sql`

Purpose:

- Converts older `teacher_assignments` schemas where `teacher_id` was primary key.
- Ensures `id uuid` exists and becomes the primary key.
- Adds unique index on `(class, section, academic_year)`.
- Adds index on `teacher_id`.

### 20. Student Auth and Attendance Records

Source: SQL block inside `docs_migrations/ATTENDANCE_SYSTEM_DOCUMENT.md`

Tables:

- `student_auth`
  - `student_id uuid primary key references students(id) on delete cascade`
  - `username text not null unique`
  - `password_hash text not null`
  - `is_active boolean not null default true`
  - `last_login_at timestamptz`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`

- `attendance_records`
  - `id uuid primary key default gen_random_uuid()`
  - `attendance_date date not null`
  - `student_id uuid not null references students(id) on delete cascade`
  - `class text not null`
  - `section text not null`
  - `academic_year text not null`
  - `status text not null`
  - `marked_by uuid references auth.users(id) on delete set null`
  - `marked_by_role text`
  - `remarks text`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
  - check: `status in ('present', 'absent', 'late', 'holiday')`
  - check: academic year format `YYYY-YY` or `YYYY-YYYY`
  - unique: `(student_id, attendance_date)`

Indexes:

- `idx_student_auth_username`
- `idx_attendance_date`
- `idx_attendance_student`
- `idx_attendance_class_section_date`
- `idx_attendance_academic_year`

Shared function from this setup block:

- `set_updated_at() returns trigger`
  - Sets `updated_at = now()`.
  - Used by triggers for `teacher_assignments`, `student_auth`, `attendance_records`, and old holiday setup in the document.

Security:

- RLS enabled for `student_auth` and `attendance_records`.
- Service role has full access policies.

### 21. Rename Mother Care to Nursery

Source: `docs_migrations/RENAME_MOTHER_CARE_TO_NURSERY.sql`

Utility:

- Loops over all public tables that have a text/varchar/char `class` column.
- Updates `mother care`, `mothercare`, and `mother-care` to `Nursery`.
- Reloads PostgREST schema.

### 22. Seed Demo Students

Source: `docs_migrations/SEED_STUDENTS_ALL_CLASSES.sql`

Utility:

- Inserts demo active students for Nursery, LKG, UKG, and classes 1 to 8.
- Creates sections A and B.
- Creates five students per section.
- Uses academic year `2026-27`.
- Includes `aadhaar_card`, `pen_number`, `admission_number`, `admission_date`, and `photo_url`.
- Skips existing active rows with same class, section, academic year, and roll number.

## Database Functions

### Functions Defined in Repo SQL

- `cleanup_expired_sessions()`
  - Source: `migrations/002_create_user_sessions.sql`
  - Deletes expired or inactive `user_sessions`.

- `fn_migrate_opening_balance_student(uuid, decimal, decimal, varchar, varchar)`
  - Source: `migrations/010_create_migration_function.sql`
  - Used by `src/controllers/migration.controller.js`.
  - Inserts positive advance into `advance_ledger` and returns pending/advance amounts for logs.

- `set_holiday_calendar_updated_at()`
  - Source: `migrations/015_create_holiday_calendar.sql` and `docs_migrations/HOLIDAY_CALENDAR_SETUP.sql`
  - Trigger function for `holiday_calendar`.

- `set_teacher_assignments_updated_at()`
  - Source: `docs_migrations/TEACHER_ASSIGNMENTS_SETUP.sql`
  - Trigger function for `teacher_assignments`.

- `set_updated_at()`
  - Source: SQL block inside `docs_migrations/ATTENDANCE_SYSTEM_DOCUMENT.md`
  - Generic trigger helper for `updated_at`.

### Functions Called by Backend but Not Defined in Current SQL Files

These RPCs are used in code. Their definitions should exist in Supabase or be
added to a future migration if missing.

- `generate_receipt_number`
  - Called from `src/controllers/bill.controller.js`.
  - Used while generating fee bills/receipts.

- `fn_process_payment`
  - Called from `src/controllers/fees.controller.js` and `src/controllers/publicFees.controller.js`.
  - Used for atomic fee payment handling.

- `fn_pay_previous_dues`
  - Called from `src/controllers/fees.controller.js`.
  - Used for previous dues payment handling.

- `promote_class_students`
  - Called from `src/controllers/promotion.controller.js`.
  - Used for class promotion.

## Tables Used by Backend Code

This list comes from Supabase `.from(...)` references in `GPS-BACKEND/src`.

- `advance_ledger`
- `attendance_records`
- `class_subjects`
- `fee_bill_items`
- `fee_bills`
- `fee_payments`
- `fee_structure` - legacy table still referenced as fallback in `fees.controller.js`
- `fee_structures`
- `holiday_calendar`
- `marks`
- `migration_control`
- `migration_logs`
- `month_closures`
- `previous_dues`
- `result_summary`
- `student_auth`
- `students`
- `subjects`
- `teacher_assignments`
- `user_roles`

## Tables Referenced but Not Fully Created by Current Migration Files

These are used or referenced by the app. The consolidated migration now creates
the base compatibility tables at the top.

- `students`
  - Base student master table used by billing, attendance, marks, and results.
  - Later migrations and scripts add admission fields and school-specific compatibility columns.

- `fees`
  - Legacy table referenced by early optional-fee migration and clear-data scripts.
  - New normalized schema uses `fee_bills`, `fee_bill_items`, and `fee_payments`.

- `fee_structure`
  - Legacy fixed-column table.
  - New normalized table is `fee_structures`.

- `user_roles`
  - Used by auth routes and preserved by clear-data scripts.
  - Base creation is included in the consolidated migration compatibility block.

- `auth.users`
  - Supabase managed auth table.

## Recommended Cleanup for Future

- Add a new migration for missing RPC definitions if Supabase has them but the repo does not.
- Move the `student_auth` and `attendance_records` SQL block from the markdown document into a numbered migration.
- Keep `holiday_date` only for compatibility; use `start_date` and `end_date` as the source of truth for holidays.
