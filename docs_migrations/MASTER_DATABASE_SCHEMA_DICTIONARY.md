# Star Public School (SPS) - Master Database Schema & Architecture Dictionary

> **Purpose:** Single source of truth for the entire database architecture. Eliminates the need to repeatedly scan individual migration files, scripts, or controllers. All tables, columns, relationships, constraints, enums, and business logic dependencies are indexed here for rapid reference.

---

## 📌 Table of Contents
1. [Dependency & Execution Order](#1-dependency--execution-order)
2. [Module 1: Authentication & User Roles](#module-1-authentication--user-roles)
3. [Module 2: Students & Student Portal](#module-2-students--student-portal)
4. [Module 3: Academics & Results (Legacy / Terminals)](#module-3-academics--results-legacy--terminals)
5. [Module 4: Examination System (Advanced Suite)](#module-4-examination-system-advanced-suite)
6. [Module 5: Fee Management & Accounting Ledger](#module-5-fee-management--accounting-ledger)
7. [Module 6: Teachers & GPS Attendance](#module-6-teachers--gps-attendance)
8. [Module 7: Timetable & Scheduling System](#module-7-timetable--scheduling-system)
9. [Module 8: Student Notifications & Push Tokens](#module-8-student-notifications--push-tokens)
10. [Module 9: Document Templates & Certificates](#module-9-document-templates--certificates)
11. [Module 10: Calendar & System Migrations](#module-10-calendar--system-migrations)
12. [Business Rules & Calculation Formulas](#business-rules--calculation-formulas)

---

## 1. Dependency & Execution Order

### Insertion / Migration Order (Topological Sort)
```
1. auth.users (Supabase Auth)
2. user_roles
3. user_sessions
4. subjects
5. class_subjects (depends on subjects)
6. students
7. student_auth (depends on students)
8. student_leave_requests (depends on students)
9. student_push_tokens (depends on students)
10. student_notifications (depends on students)
11. marks (depends on students, subjects)
12. result_summary (depends on students)
13. examinations
14. examination_subjects (depends on examinations)
15. examination_timetables (depends on examinations)
16. examination_marks (depends on examinations, examination_subjects, students)
17. examination_results (depends on examinations, students)
18. examination_notices (depends on examinations)
19. examination_audit_logs (depends on examinations)
20. fee_structures
21. fee_bills (depends on students, fee_structures)
22. fee_bill_items (depends on fee_bills)
23. fee_payments (depends on students, fee_bills)
24. previous_dues (depends on students)
25. advance_ledger (depends on students)
26. month_closures
27. teacher_profiles (depends on auth.users)
28. teacher_assignments (depends on teacher_profiles)
29. teacher_attendance_settings
30. teacher_attendance_records (depends on teacher_profiles)
31. teacher_leave_requests (depends on teacher_profiles)
32. teacher_attendance_audit_logs (depends on teacher_profiles)
33. teacher_notifications (depends on teacher_profiles)
34. timetable_settings
35. timetable_periods (depends on timetable_settings)
36. timetable_entries (depends on timetable_periods, teacher_profiles, subjects)
37. timetable_substitutions (depends on timetable_entries, teacher_profiles)
38. timetable_audit_logs
39. document_templates
40. holiday_calendar
41. migration_control & migration_logs
```

### Deletion / Truncation Order (Foreign Key Safe Reverse)
```
timetable_audit_logs -> timetable_substitutions -> timetable_entries -> timetable_periods -> timetable_settings ->
teacher_notifications -> teacher_attendance_audit_logs -> teacher_leave_requests -> teacher_attendance_records -> teacher_assignments -> teacher_attendance_settings -> teacher_profiles ->
examination_audit_logs -> examination_notices -> examination_results -> examination_marks -> examination_timetables -> examination_subjects -> examinations ->
student_notifications -> student_push_tokens -> student_leave_requests -> student_auth ->
fee_payments -> fee_bill_items -> fee_bills -> advance_ledger -> previous_dues -> month_closures -> fee_structures ->
marks -> result_summary -> class_subjects -> subjects -> students ->
user_sessions -> user_roles
```

---

## Module 1: Authentication & User Roles

### `auth.users` (Supabase Built-in)
- **Primary Key:** `id` (UUID)
- **Fields:** `email`, `encrypted_password`, `user_metadata` (jsonb), `created_at`, `updated_at`.

### `user_roles`
- **Purpose:** Assigns application permissions to authenticated users.
- **Columns:**
  - `id`: UUID (PK, default `uuid_generate_v4()`)
  - `user_id`: UUID (FK -> `auth.users.id` ON DELETE CASCADE)
  - `role`: VARCHAR(20) NOT NULL (`'admin'`, `'teacher'`, `'superadmin'`)
  - `created_at`: TIMESTAMPTZ DEFAULT now()
- **Unique Constraint:** `(user_id, role)`

### `user_sessions`
- **Purpose:** Tracks active logins, token tracking, device info.
- **Columns:**
  - `id`: UUID (PK)
  - `user_id`: UUID (FK -> `auth.users.id`)
  - `token_hash`: TEXT NOT NULL
  - `ip_address`: TEXT
  - `user_agent`: TEXT
  - `last_active_at`: TIMESTAMPTZ
  - `expires_at`: TIMESTAMPTZ
  - `created_at`: TIMESTAMPTZ

---

## Module 2: Students & Student Portal

### `students`
- **Purpose:** Master repository of enrolled students.
- **Columns:**
  - `id`: UUID (PK, default `gen_random_uuid()` or `uuid_generate_v4()`)
  - `admission_no`: VARCHAR(50) (UNIQUE)
  - `roll_no`: INTEGER NOT NULL
  - `name`: VARCHAR(100) NOT NULL
  - `class`: VARCHAR(20) NOT NULL (e.g. `'NURSERY'`, `'LKG'`, `'UKG'`, `'1'`, `'2'`, ..., `'8'`)
  - `section`: VARCHAR(10) DEFAULT `'A'`
  - `gender`: VARCHAR(10)
  - `dob`: DATE
  - `father_name`: VARCHAR(100) NOT NULL
  - `mother_name`: VARCHAR(100)
  - `phone`: VARCHAR(20)
  - `alt_phone`: VARCHAR(20)
  - `address`: TEXT
  - `city`: VARCHAR(50)
  - `state`: VARCHAR(50) DEFAULT `'Bihar'`
  - `pincode`: VARCHAR(10)
  - `aadhaar_number`: VARCHAR(20)
  - `pen_number`: VARCHAR(30) (Permanent Education Number)
  - `photo_url`: TEXT
  - `username`: VARCHAR(50) (UNIQUE, format: e.g. `SPS2026001`)
  - `status`: VARCHAR(20) DEFAULT `'active'` (`'active'`, `'inactive'`, `'alumni'`, `'tc_issued'`)
  - `admission_date`: DATE DEFAULT CURRENT_DATE
  - `created_at`: TIMESTAMPTZ DEFAULT now()
  - `updated_at`: TIMESTAMPTZ DEFAULT now()
- **Indexes:** `idx_students_class_section`, `idx_students_roll_no`, `idx_students_username`

### `student_auth`
- **Purpose:** Independent credentials for student mobile app login.
- **Columns:**
  - `id`: UUID (PK)
  - `student_id`: UUID (FK -> `students.id` ON DELETE CASCADE, UNIQUE)
  - `username`: VARCHAR(50) (UNIQUE)
  - `password_hash`: TEXT NOT NULL
  - `is_first_login`: BOOLEAN DEFAULT true
  - `must_change_password`: BOOLEAN DEFAULT false
  - `created_at`, `updated_at`: TIMESTAMPTZ

### `student_leave_requests`
- **Purpose:** Mobile leave applications.
- **Columns:**
  - `id`: UUID (PK)
  - `student_id`: UUID (FK -> `students.id`)
  - `class`: TEXT NOT NULL, `section`: TEXT NOT NULL, `roll_no`: INT
  - `academic_year`: TEXT NOT NULL
  - `leave_type`: TEXT NOT NULL (`'sick'`, `'casual'`, `'emergency'`)
  - `from_date`: DATE NOT NULL, `to_date`: DATE NOT NULL
  - `reason`: TEXT NOT NULL
  - `status`: TEXT DEFAULT `'pending'` (`'pending'`, `'approved'`, `'rejected'`)
  - `admin_remarks`: TEXT
  - `decided_by`: UUID, `decided_at`: TIMESTAMPTZ
  - `created_at`, `updated_at`: TIMESTAMPTZ

### `attendance_records` (Student Attendance)
- **Columns:**
  - `id`: UUID (PK)
  - `student_id`: UUID (FK -> `students.id`)
  - `date`: DATE NOT NULL
  - `status`: VARCHAR(10) NOT NULL (`'P'`, `'A'`, `'L'`, `'H'`)
  - `remarks`: TEXT
  - `created_at`: TIMESTAMPTZ
- **Constraint:** UNIQUE `(student_id, date)`

---

## Module 3: Academics & Results (Legacy / Terminals)

### `subjects`
- **Columns:**
  - `id`: UUID (PK)
  - `name`: VARCHAR(50) UNIQUE NOT NULL (e.g. `'Mathematics'`, `'Science'`)
  - `code`: VARCHAR(10) UNIQUE NOT NULL (e.g. `'MATH'`, `'SCI'`)
  - `max_external_marks`: INT DEFAULT 80
  - `max_internal_marks`: INT DEFAULT 20
  - `created_at`, `updated_at`: TIMESTAMPTZ

### `class_subjects`
- **Columns:**
  - `id`: UUID (PK)
  - `class`: VARCHAR(20) NOT NULL
  - `section`: VARCHAR(10) DEFAULT `'A'`
  - `subject_id`: UUID (FK -> `subjects.id` ON DELETE CASCADE)
  - `sequence`: INT
  - `created_at`: TIMESTAMPTZ
- **Constraint:** UNIQUE `(class, subject_id, section)`

### `marks`
- **Columns:**
  - `id`: UUID (PK)
  - `student_id`: UUID (FK -> `students.id` ON DELETE CASCADE)
  - `subject_id`: UUID (FK -> `subjects.id` ON DELETE CASCADE)
  - `terminal`: VARCHAR(20) NOT NULL (e.g. `'Terminal 1'`, `'Terminal 2'`, `'Annual'`)
  - `external_marks`: NUMERIC(5,2)
  - `internal_marks`: NUMERIC(5,2)
  - `status`: VARCHAR(20) DEFAULT `'PENDING'`
  - `created_at`, `updated_at`: TIMESTAMPTZ
- **Constraint:** UNIQUE `(student_id, subject_id, terminal)`

### `result_summary`
- **Columns:**
  - `id`: UUID (PK)
  - `student_id`: UUID (FK -> `students.id` ON DELETE CASCADE)
  - `terminal`: VARCHAR(20) NOT NULL
  - `total_marks`: NUMERIC(7,2)
  - `total_obtained`: NUMERIC(7,2)
  - `percentage`: NUMERIC(5,2)
  - `division`: VARCHAR(20) (`'1st'`, `'2nd'`, `'3rd'`, `'Fail'`)
  - `rank`: INT
  - `status`: VARCHAR(20) (`'PASSED'`, `'FAILED'`)
  - `calculated_at`: TIMESTAMPTZ
- **Constraint:** UNIQUE `(student_id, terminal)`

---

## Module 4: Examination System (Advanced Suite)

### `examinations`
- **Columns:**
  - `id`: UUID (PK)
  - `name`: VARCHAR(150) NOT NULL
  - `academic_session`: VARCHAR(30) NOT NULL (e.g. `'2025-2026'`)
  - `exam_type`: VARCHAR(50) NOT NULL (`'Unit Test'`, `'Monthly Test'`, `'Half-Yearly Examination'`, `'Annual Examination'`, `'Periodic Assessment'`)
  - `start_date`, `end_date`: DATE NOT NULL
  - `applicable_classes`: JSONB DEFAULT `'[]'`
  - `description`: TEXT
  - `status`: VARCHAR(30) DEFAULT `'draft'` (`'draft'`, `'scheduled'`, `'ongoing'`, `'completed'`, `'archived'`)
  - `result_published`: BOOLEAN DEFAULT false
  - `result_published_at`: TIMESTAMPTZ
  - `created_by`: VARCHAR(100)
  - `created_at`, `updated_at`: TIMESTAMPTZ

### `examination_subjects`
- **Columns:**
  - `id`: UUID (PK)
  - `examination_id`: UUID (FK -> `examinations.id` ON DELETE CASCADE)
  - `class_name`: VARCHAR(50) NOT NULL
  - `subject_name`: VARCHAR(100) NOT NULL
  - `subject_code`: VARCHAR(30)
  - `max_marks`: NUMERIC(6,2) DEFAULT 100
  - `pass_marks`: NUMERIC(6,2) DEFAULT 33
  - `theory_marks`: NUMERIC(6,2) DEFAULT 80
  - `practical_marks`: NUMERIC(6,2) DEFAULT 0
  - `oral_marks`: NUMERIC(6,2) DEFAULT 0
  - `internal_marks`: NUMERIC(6,2) DEFAULT 20
  - `is_optional`: BOOLEAN DEFAULT false
  - `evaluation_type`: VARCHAR(20) DEFAULT `'marks'` (`'marks'`, `'grade'`)
- **Constraint:** UNIQUE `(examination_id, class_name, subject_name)`

### `examination_timetables` (Routines)
- **Columns:**
  - `id`: UUID (PK)
  - `examination_id`: UUID (FK -> `examinations.id` ON DELETE CASCADE)
  - `class_name`: VARCHAR(50) NOT NULL
  - `section`: VARCHAR(30) DEFAULT `'All'`
  - `subject_name`: VARCHAR(100) NOT NULL
  - `exam_date`: DATE NOT NULL
  - `start_time`: VARCHAR(10) NOT NULL (e.g. `'09:00'`)
  - `end_time`: VARCHAR(10) NOT NULL (e.g. `'12:00'`)
  - `room_no`: VARCHAR(50)
  - `invigilator_name`: VARCHAR(100)
  - `instructions`: TEXT

### `examination_marks`
> **Note on Workflow:** Examination Management UI me se duplicate "Marks Entry" tab hata diya gaya hai, kyunki Admin & Teacher dono ke liye primary aur unified **Submit Marks / Marks Upload** (`/marks-upload`) system active hai jo direct evaluation aur marksheet pipeline se connected hai.
- **Columns:**
  - `id`: UUID (PK)
  - `examination_id`: UUID (FK -> `examinations.id` ON DELETE CASCADE)
  - `exam_subject_id`: UUID (FK -> `examination_subjects.id` ON DELETE CASCADE)
  - `student_id`: UUID (FK -> `students.id` ON DELETE CASCADE)
  - `theory_obtained`: NUMERIC(6,2) DEFAULT 0
  - `practical_obtained`: NUMERIC(6,2) DEFAULT 0
  - `oral_obtained`: NUMERIC(6,2) DEFAULT 0
  - `internal_obtained`: NUMERIC(6,2) DEFAULT 0
  - `total_obtained`: NUMERIC(6,2) DEFAULT 0
  - `grade`: VARCHAR(10)
  - `is_absent`: BOOLEAN DEFAULT false
  - `remarks`: TEXT
  - `entered_by`: VARCHAR(100)
  - `updated_at`: TIMESTAMPTZ
- **Constraint:** UNIQUE `(examination_id, exam_subject_id, student_id)`

### `examination_results` (Published Report Cards)
- **Columns:**
  - `id`: UUID (PK)
  - `examination_id`: UUID (FK -> `examinations.id` ON DELETE CASCADE)
  - `student_id`: UUID (FK -> `students.id` ON DELETE CASCADE)
  - `class_name`: VARCHAR(50) NOT NULL
  - `section`: VARCHAR(30) NOT NULL
  - `roll_no`: INT NOT NULL
  - `total_max_marks`: NUMERIC(8,2) NOT NULL
  - `total_obtained_marks`: NUMERIC(8,2) NOT NULL
  - `percentage`: NUMERIC(5,2) NOT NULL
  - `overall_grade`: VARCHAR(10)
  - `result_status`: VARCHAR(20) NOT NULL (`'PASSED'`, `'FAILED'`, `'COMPARTMENT'`, `'WITHHELD'`)
  - `class_rank`: INT
  - `section_rank`: INT
  - `subject_details`: JSONB NOT NULL DEFAULT `'[]'`
  - `remarks`: TEXT
  - `published_at`: TIMESTAMPTZ DEFAULT now()
- **Constraint:** UNIQUE `(examination_id, student_id)`

### `examination_notices` & `examination_audit_logs`
- Notices for exam schedules and auditable tracking logs.

---

## Module 5: Fee Management & Accounting Ledger

### `fee_structures`
- **Purpose:** Defines base monthly fee, admission fee, exam fee per class.
- **Columns:**
  - `id`: UUID (PK)
  - `class_name`: VARCHAR(50) NOT NULL
  - `academic_session`: VARCHAR(30) NOT NULL
  - `tuition_fee`: NUMERIC(10,2) DEFAULT 0
  - `admission_fee`: NUMERIC(10,2) DEFAULT 0
  - `annual_fee`: NUMERIC(10,2) DEFAULT 0
  - `exam_fee`: NUMERIC(10,2) DEFAULT 0
  - `transport_fee`: NUMERIC(10,2) DEFAULT 0
  - `other_fee`: NUMERIC(10,2) DEFAULT 0
  - `created_at`, `updated_at`: TIMESTAMPTZ
- **Constraint:** UNIQUE `(class_name, academic_session)`

### `fee_bills`
- **Purpose:** Monthly generated invoices for each student.
- **Columns:**
  - `id`: UUID (PK)
  - `student_id`: UUID (FK -> `students.id` ON DELETE CASCADE)
  - `bill_no`: VARCHAR(50) UNIQUE NOT NULL
  - `month`: INT NOT NULL (1-12)
  - `year`: INT NOT NULL
  - `academic_session`: VARCHAR(30) NOT NULL
  - `bill_date`: DATE NOT NULL
  - `due_date`: DATE NOT NULL
  - `tuition_fee`, `admission_fee`, `exam_fee`, `transport_fee`, `other_fee`: NUMERIC(10,2) DEFAULT 0
  - `previous_due_carried`: NUMERIC(10,2) DEFAULT 0
  - `late_fine`: NUMERIC(10,2) DEFAULT 0
  - `discount_amount`: NUMERIC(10,2) DEFAULT 0
  - `total_billed_amount`: NUMERIC(10,2) NOT NULL
  - `paid_amount`: NUMERIC(10,2) DEFAULT 0
  - `balance_due`: NUMERIC(10,2) NOT NULL
  - `status`: VARCHAR(20) DEFAULT `'unpaid'` (`'unpaid'`, `'partially_paid'`, `'paid'`, `'cancelled'`)
  - `created_at`, `updated_at`: TIMESTAMPTZ

### `fee_bill_items`
- Detailed itemization of each line item in `fee_bills`.

### `fee_payments`
- **Purpose:** Transaction records when money is collected.
- **Columns:**
  - `id`: UUID (PK)
  - `student_id`: UUID (FK -> `students.id` ON DELETE CASCADE)
  - `bill_id`: UUID (FK -> `fee_bills.id` ON DELETE SET NULL)
  - `payment_date`: DATE NOT NULL DEFAULT CURRENT_DATE
  - `amount_paid`: NUMERIC(10,2) NOT NULL
  - `payment_mode`: VARCHAR(30) NOT NULL (`'CASH'`, `'ONLINE'`, `'UPI'`, `'CHEQUE'`, `'BANK_TRANSFER'`)
  - `transaction_id`: TEXT (UNIQUE index where not null)
  - `receipt_no`: TEXT
  - `collected_by`: VARCHAR(100)
  - `remarks`: TEXT
  - `created_at`: TIMESTAMPTZ

### `previous_dues`
- **Purpose:** Tracks legacy/opening dues carried over from previous sessions.
- **Columns:**
  - `id`: UUID (PK)
  - `student_id`: UUID (FK -> `students.id` ON DELETE CASCADE, UNIQUE)
  - `initial_dues`: NUMERIC(10,2) NOT NULL DEFAULT 0
  - `remaining_dues`: NUMERIC(10,2) NOT NULL DEFAULT 0
  - `academic_session`: VARCHAR(30)
  - `remarks`: TEXT
  - `created_at`, `updated_at`: TIMESTAMPTZ

### `advance_ledger`
- **Purpose:** Tracks student credit/wallet balances (advance payments).
- **Columns:**
  - `id`: UUID (PK)
  - `student_id`: UUID (FK -> `students.id` ON DELETE CASCADE)
  - `credit_amount`: NUMERIC(10,2) DEFAULT 0
  - `debit_amount`: NUMERIC(10,2) DEFAULT 0
  - `balance`: NUMERIC(10,2) NOT NULL
  - `reference_payment_id`: UUID
  - `remarks`: TEXT
  - `created_at`: TIMESTAMPTZ

### `month_closures`
- Auditable record of closed accounting months preventing modifications to billed invoices.

---

## Module 6: Teachers & GPS Attendance

### `teacher_profiles`
- **Columns:**
  - `id`: UUID (PK, references `auth.users.id` or independent UUID)
  - `teacher_id`: VARCHAR(50) UNIQUE NOT NULL (e.g. `'TCH202601'`)
  - `name`: VARCHAR(100) NOT NULL
  - `email`: VARCHAR(100) UNIQUE NOT NULL
  - `phone`: VARCHAR(20)
  - `designation`: VARCHAR(50)
  - `qualification`: VARCHAR(100)
  - `joining_date`: DATE
  - `status`: VARCHAR(20) DEFAULT `'active'`
  - `created_at`, `updated_at`: TIMESTAMPTZ

### `teacher_assignments`
- **Purpose:** Maps teachers to classes, sections, and subjects.
- **Columns:**
  - `id`: UUID (PK)
  - `teacher_id`: UUID (FK -> `teacher_profiles.id` ON DELETE CASCADE)
  - `class_name`: VARCHAR(50) NOT NULL
  - `section`: VARCHAR(30) DEFAULT `'A'`
  - `subject_id`: UUID (FK -> `subjects.id` ON DELETE SET NULL)
  - `is_class_teacher`: BOOLEAN DEFAULT false
  - `academic_session`: VARCHAR(30) NOT NULL

### `teacher_attendance_settings`
- **Columns:**
  - `id`: UUID (PK)
  - `school_latitude`: NUMERIC(10,7) (e.g. 26.8021)
  - `school_longitude`: NUMERIC(10,7) (e.g. 84.5028)
  - `geofence_radius_meters`: INT DEFAULT 150
  - `in_time_start`, `in_time_end`: TIME
  - `out_time_start`, `out_time_end`: TIME
  - `grace_period_minutes`: INT DEFAULT 15

### `teacher_attendance_records` (GPS & Biometric Verification)
- **Columns:**
  - `id`: UUID (PK)
  - `teacher_id`: UUID (FK -> `teacher_profiles.id` ON DELETE CASCADE)
  - `attendance_date`: DATE NOT NULL
  - `check_in_time`: TIMESTAMPTZ
  - `check_in_latitude`, `check_in_longitude`: NUMERIC(10,7)
  - `check_in_distance_meters`: NUMERIC(8,2)
  - `check_out_time`: TIMESTAMPTZ
  - `check_out_latitude`, `check_out_longitude`: NUMERIC(10,7)
  - `check_out_distance_meters`: NUMERIC(8,2)
  - `status`: VARCHAR(20) (`'present'`, `'late'`, `'half_day'`, `'absent'`, `'on_leave'`)
  - `is_verified_geofence`: BOOLEAN DEFAULT true
  - `created_at`: TIMESTAMPTZ
- **Constraint:** UNIQUE `(teacher_id, attendance_date)`

### `teacher_leave_requests` & `teacher_notifications`
- Teacher leave requests and direct broadcast notices.

---

## Module 7: Timetable & Scheduling System

### `timetable_settings`
- **Columns:**
  - `id`: UUID (PK)
  - `academic_session`: VARCHAR(30) NOT NULL
  - `effective_date`: DATE NOT NULL
  - `school_start_time`: VARCHAR(10) DEFAULT `'08:00'`
  - `school_end_time`: VARCHAR(10) DEFAULT `'14:30'`
  - `working_days`: JSONB (e.g. `["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]`)
  - `periods_per_day`: INT DEFAULT 8
  - `status`: VARCHAR(20) DEFAULT `'active'`
- **Constraint:** UNIQUE `(academic_session, effective_date)`

### `timetable_periods`
- **Columns:**
  - `id`: UUID (PK)
  - `settings_id`: UUID (FK -> `timetable_settings.id` ON DELETE CASCADE)
  - `weekday`: VARCHAR(20) DEFAULT `'ALL'`
  - `period_number`: INT NOT NULL
  - `name`: VARCHAR(50) NOT NULL
  - `type`: VARCHAR(30) DEFAULT `'regular'` (`'regular'`, `'assembly'`, `'break'`, `'lunch'`, `'activity'`)
  - `start_time`: VARCHAR(10) NOT NULL, `end_time`: VARCHAR(10) NOT NULL
  - `is_break`: BOOLEAN DEFAULT false
  - `is_active`: BOOLEAN DEFAULT true
  - `sort_order`: INT DEFAULT 0
- **Constraint:** UNIQUE `(settings_id, weekday, period_number)`

### `timetable_entries`
- **Columns:**
  - `id`: UUID (PK)
  - `academic_session`: VARCHAR(30) NOT NULL
  - `weekday`: VARCHAR(20) NOT NULL
  - `period_id`: UUID (FK -> `timetable_periods.id` ON DELETE SET NULL)
  - `period_number`: INT NOT NULL
  - `start_time`, `end_time`: VARCHAR(10)
  - `class_name`: VARCHAR(50) NOT NULL
  - `section`: VARCHAR(30) DEFAULT `'A'`
  - `subject_id`: UUID (FK -> `subjects.id` ON DELETE SET NULL)
  - `subject_name`: VARCHAR(100) NOT NULL
  - `teacher_id`: UUID (FK -> `teacher_profiles.id` ON DELETE SET NULL)
  - `teacher_name`: VARCHAR(100) NOT NULL
  - `room_no`: VARCHAR(50)
  - `is_active`: BOOLEAN DEFAULT true
- **Constraint:** No teacher double-booking & no class-room double-booking on same period & day.

### `timetable_substitutions`
- Substitute teacher reassignments when regular teacher is on leave.

---

## Module 8: Student Notifications & Push Tokens

### `student_push_tokens`
- **Columns:**
  - `id`: UUID (PK)
  - `student_id`: UUID (FK -> `students.id` ON DELETE CASCADE)
  - `push_token`: TEXT UNIQUE NOT NULL
  - `platform`: TEXT (`'android'`, `'ios'`, `'web'`)
  - `device_id`: TEXT
  - `is_active`: BOOLEAN DEFAULT true
  - `last_seen_at`: TIMESTAMPTZ

### `student_notifications`
- **Columns:**
  - `id`: UUID (PK)
  - `student_id`: UUID (FK -> `students.id` ON DELETE CASCADE)
  - `notification_type`: TEXT DEFAULT `'general'` (`'fee_due'`, `'fee_payment'`, `'result_published'`, `'exam_schedule'`, `'attendance'`, `'general'`)
  - `source_type`: TEXT, `source_id`: UUID
  - `title`: TEXT NOT NULL, `body`: TEXT NOT NULL
  - `notification_data`: JSONB DEFAULT `'{}'`
  - `delivery_status`: TEXT DEFAULT `'queued'` (`'queued'`, `'sent'`, `'failed'`)
  - `is_read`: BOOLEAN DEFAULT false
  - `read_at`: TIMESTAMPTZ

---

## Module 9: Document Templates & Certificates

### `document_templates`
- **Columns:**
  - `id`: UUID (PK)
  - `category`: VARCHAR(50) NOT NULL (`'id_card'`, `'admit_card'`, `'transfer_certificate'`, `'marksheet'`)
  - `active_template_id`: VARCHAR(100) NOT NULL
  - `customization`: JSONB DEFAULT `'{}'` (contains primaryColor, schoolName, principalSignLabel, QR config, etc.)
  - `school_id`: VARCHAR(100) DEFAULT `'default_school'`
- **Constraint:** UNIQUE `(category, school_id)`

---

## Module 10: Calendar & System Migrations

### `holiday_calendar`
- **Columns:**
  - `id`: UUID (PK)
  - `title`: VARCHAR(100) NOT NULL
  - `start_date`: DATE NOT NULL
  - `end_date`: DATE NOT NULL
  - `type`: VARCHAR(30) DEFAULT `'holiday'` (`'holiday'`, `'vacation'`, `'event'`)
  - `description`: TEXT
  - `is_restricted`: BOOLEAN DEFAULT false
  - `academic_session`: VARCHAR(30)

### `migration_control` & `migration_logs`
- Controls idempotency and audit logs for direct database schema updates and data imports.

---

## Business Rules & Calculation Formulas

1. **Student Total Fee Due Calculation:**
   $$\text{Current Net Dues} = \sum (\text{fee\_bills.balance\_due}) + \text{previous\_dues.remaining\_dues} - \text{advance\_ledger.balance}$$
2. **Result Summary Grade & Division:**
   - Percentage $\ge 60\% \implies$ 1st Division
   - Percentage $45\% - 59.9\% \implies$ 2nd Division
   - Percentage $33\% - 44.9\% \implies$ 3rd Division
   - Percentage $< 33\% \implies$ Fail
3. **Teacher Geofencing Calculation (Haversine Formula):**
   - If distance $\le \text{geofence\_radius\_meters}$ (default $150\text{m}$) $\implies$ `is_verified_geofence = true`.
   - If check-in time $>$ expected start time + `grace_period_minutes` $\implies$ status marked as `'late'`.
4. **Student Unique Credentials Format:**
   - Username: `SPS` + `Year` + Roll/Sequence (e.g. `SPS2026001`).
   - Default Initial Password: `SpsPassword@2026` or Date of Birth format `DDMMYYYY`.

---
*Created automatically for AI context optimization. Update this document whenever a migration or schema alteration is executed.*
