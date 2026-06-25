# Attendance System Document

This document keeps all attendance-related setup, schema, APIs, frontend files, and role flows in one place.

## Current Related Files

Backend:
- `src/routes/attendance.routes.js`
  - Demo/in-memory attendance API.
  - Used by current attendance page for bootstrap/save fallback.
- `src/routes/auth.routes.js`
  - DB-backed teacher assignment APIs.
  - Login/refresh can return `assignedClass`, `assignedSection`, `academicYear`.
- `src/server.js`
  - Registers `/api/attendance`.
- `docs_migrations/TEACHER_ASSIGNMENTS_SETUP.sql`
  - Existing teacher assignment SQL.

Frontend:
- `src/Pages/Attendance/AttendanceSystem.jsx`
  - Attendance UI: admin overview, mark attendance, dashboards, student history.
- `src/Api/attendance.js`
  - API wrapper for demo attendance endpoints.
- `src/Api/auth.js`
  - Auth + teacher assignment API wrapper.
- `src/Api/classes.js`
  - Class/section fetch helpers.
- `src/Pages/AllDashboard/TeacherManagement.jsx`
  - Admin UI to assign teacher to class/section.
- `src/Components/Sidebar.jsx`
  - Shows Attendance menu for admin, teacher, student.

## Roles And Flow

Admin:
- Login from main `/login`.
- Open Dashboard > Attendance.
- Can view school overview.
- Can mark attendance for any class/section.
- Can view reports/history.
- Can assign teacher to class/section from Teacher Management.

Teacher:
- Login from main `/login`.
- Backend returns assigned class/section when assignment exists.
- Open Dashboard > Attendance.
- Should mark attendance only for assigned class/section.
- Can view reports/history for assigned class/section.

Student:
- Student login should use student credentials.
- Student sees only own attendance.
- Student history and percentage are calculated from attendance records.

## Complete Supabase Schema

Run this SQL in Supabase SQL Editor.

```sql
-- Attendance system schema for Supabase.
-- Includes teacher assignment, student login mapping, and attendance records.

create extension if not exists pgcrypto;

create table if not exists public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class text not null,
  section text not null,
  academic_year text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_assignments_academic_year_format
    check (academic_year ~ '^\d{4}-(\d{2}|\d{4})$'),
  constraint teacher_assignments_unique_class_section_year
    unique (class, section, academic_year)
);

create table if not exists public.student_auth (
  student_id uuid primary key references public.students(id) on delete cascade,
  username text not null unique,
  password_hash text not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  attendance_date date not null,
  student_id uuid not null references public.students(id) on delete cascade,
  class text not null,
  section text not null,
  academic_year text not null,
  status text not null,
  marked_by uuid references auth.users(id) on delete set null,
  marked_by_role text,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint attendance_status_check
    check (status in ('present', 'absent', 'late', 'holiday')),
  constraint attendance_academic_year_format
    check (academic_year ~ '^\d{4}-(\d{2}|\d{4})$'),
  constraint attendance_unique_student_date
    unique (student_id, attendance_date)
);

create table if not exists public.holiday_calendar (
  id uuid primary key default gen_random_uuid(),
  holiday_date date,
  start_date date not null default current_date,
  end_date date not null default current_date,
  title text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holiday_calendar_date_range_check check (end_date >= start_date)
);

create index if not exists idx_teacher_assignments_class_section_year
  on public.teacher_assignments (class, section, academic_year);

create index if not exists idx_student_auth_username
  on public.student_auth (username);

create index if not exists idx_attendance_date
  on public.attendance_records (attendance_date);

create index if not exists idx_attendance_student
  on public.attendance_records (student_id);

create index if not exists idx_attendance_class_section_date
  on public.attendance_records (class, section, attendance_date);

create index if not exists idx_attendance_academic_year
  on public.attendance_records (academic_year);

create index if not exists idx_holiday_calendar_date
  on public.holiday_calendar (holiday_date);

create index if not exists idx_holiday_calendar_range
  on public.holiday_calendar (start_date, end_date);

create unique index if not exists idx_holiday_calendar_unique_range_title
  on public.holiday_calendar (start_date, end_date, title);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_teacher_assignments_updated_at on public.teacher_assignments;
create trigger trg_teacher_assignments_updated_at
before update on public.teacher_assignments
for each row execute function public.set_updated_at();

drop trigger if exists trg_student_auth_updated_at on public.student_auth;
create trigger trg_student_auth_updated_at
before update on public.student_auth
for each row execute function public.set_updated_at();

drop trigger if exists trg_attendance_records_updated_at on public.attendance_records;
create trigger trg_attendance_records_updated_at
before update on public.attendance_records
for each row execute function public.set_updated_at();

drop trigger if exists trg_holiday_calendar_updated_at on public.holiday_calendar;
create trigger trg_holiday_calendar_updated_at
before update on public.holiday_calendar
for each row execute function public.set_updated_at();

alter table public.teacher_assignments enable row level security;
alter table public.student_auth enable row level security;
alter table public.attendance_records enable row level security;
alter table public.holiday_calendar enable row level security;

drop policy if exists "teacher_assignments_service_role_all" on public.teacher_assignments;
create policy "teacher_assignments_service_role_all"
on public.teacher_assignments
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "student_auth_service_role_all" on public.student_auth;
create policy "student_auth_service_role_all"
on public.student_auth
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "attendance_records_service_role_all" on public.attendance_records;
create policy "attendance_records_service_role_all"
on public.attendance_records
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "holiday_calendar_service_role_all" on public.holiday_calendar;
create policy "holiday_calendar_service_role_all"
on public.holiday_calendar
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
```

## Teacher Assignment APIs

These are DB-backed and already belong under `/api/auth`.

### List Teachers

`GET /api/auth/teachers`

Auth:
- Admin only.

Returns:
```json
{
  "success": true,
  "count": 1,
  "teachers": [
    {
      "id": "teacher-user-id",
      "role": "teacher",
      "email": "teacher@school.com",
      "assignment": {
        "teacher_id": "teacher-user-id",
        "class": "Class 8",
        "section": "A",
        "academic_year": "2026-27"
      },
      "assignedClass": "Class 8",
      "assignedSection": "A",
      "academicYear": "2026-27"
    }
  ]
}
```

### Assign Teacher

`PATCH /api/auth/teachers/:id/assignment`

Auth:
- Admin only.

Body:
```json
{
  "class": "Class 8",
  "section": "A",
  "academic_year": "2026-27"
}
```

Rules:
- One teacher can have multiple active assignments.
- One class/section/year can be assigned to one teacher.

### Remove Teacher Assignment

`DELETE /api/auth/teachers/:id/assignment`

Auth:
- Admin only.

## Attendance APIs To Implement DB-Backed

The current `/api/attendance` route is demo/in-memory. For production, replace it with DB-backed endpoints using `attendance_records`.

### Bootstrap Attendance

`GET /api/attendance/bootstrap`

Auth:
- Admin, teacher, student.

Expected response:
```json
{
  "success": true,
  "classes": ["Class 8", "Class 9"],
  "sections": ["A", "B"],
  "users": [],
  "attendance": {
    "2026-06-01": {
      "student-id": "present"
    }
  }
}
```

### Save Attendance

`POST /api/attendance/records`

Auth:
- Admin or teacher.

Body:
```json
{
  "date": "2026-06-01",
  "class": "Class 8",
  "section": "A",
  "academic_year": "2026-27",
  "statuses": {
    "student-id-1": "present",
    "student-id-2": "absent",
    "student-id-3": "late"
  }
}
```

Backend behavior:
- Validate teacher assignment if role is `teacher`.
- Fetch matching active students from `students`.
- Upsert into `attendance_records` on `(student_id, attendance_date)`.
- Store `marked_by = req.user.id`.
- Store `marked_by_role = req.user.role`.

### Get Attendance Records

`GET /api/attendance/records`

Query examples:
```text
/api/attendance/records?date=2026-06-01
/api/attendance/records?student_id=<uuid>
/api/attendance/records?class=Class%208&section=A&month=2026-06
```

Auth behavior:
- Admin can query all.
- Teacher can query assigned class/section.
- Student can query only own records.

### Student Attendance

`GET /api/attendance/students/:studentId`

Auth behavior:
- Admin can access any student.
- Teacher can access assigned class/section students.
- Student can access own attendance only.

### Holiday Calendar

`GET /api/attendance/holidays?month=2026-06`

Auth:
- Admin, teacher, student.

Behavior:
- Returns admin-created holidays from `holiday_calendar`.
- Also includes auto Friday weekly holidays in the requested month/range.

`POST /api/attendance/holidays`

Auth:
- Admin only.

Body:
```json
{
  "start_date": "2026-06-20",
  "end_date": "2026-07-05",
  "title": "Summer Break",
  "description": "School closed",
  "apply_to_attendance": true
}
```

Behavior:
- Saves/updates one holiday range row in `holiday_calendar`.
- Marks active students as `holiday` in `attendance_records` for every date in that range.

`DELETE /api/attendance/holidays/:id`

Auth:
- Admin only.

Behavior:
- Removes the manual holiday.
- Removes system-created holiday attendance rows for that date.

## Student Login Schema Notes

`student_auth` maps a student record to login credentials.

Recommended username options:
- roll number plus class/year, for example `2026-27-Class8-A-01`
- admission number if available
- mobile number if school wants parent-based login

Password rule:
- Never store plain text password.
- Store bcrypt hash in `student_auth.password_hash`.

Suggested backend endpoints:

```text
POST /api/student-auth/login
POST /api/student-auth/create
PATCH /api/student-auth/:studentId/reset-password
```

Student login response should match app session format:

```json
{
  "success": true,
  "user": {
    "id": "student-id",
    "role": "student",
    "name": "Student Name",
    "class": "Class 8",
    "section": "A",
    "rollNo": "01"
  },
  "access_token": "student-session-token"
}
```

## Frontend Integration Notes

Attendance page currently uses:

```text
src/Pages/Attendance/AttendanceSystem.jsx
src/Api/attendance.js
```

Important behavior already added:
- If main app user is logged in, attendance page does not show separate login.
- Admin opens `overview`.
- Teacher opens `mark-attendance`.
- Student opens `my-attendance`.

Teacher assignment UI:

```text
src/Pages/AllDashboard/TeacherManagement.jsx
```

Uses:
```text
GET /api/auth/teachers
PATCH /api/auth/teachers/:id/assignment
DELETE /api/auth/teachers/:id/assignment
GET /api/students/classes
```

## Production Implementation Checklist

1. Run the complete SQL schema above in Supabase SQL Editor.
2. Keep `SUPABASE_SERVICE_KEY` configured in backend environment.
3. Replace in-memory logic in `src/routes/attendance.routes.js` with Supabase queries.
4. Add student login endpoints if student portal login is required.
5. Make attendance frontend consume real student rows from `students`, not seed `USERS`.
6. Enforce teacher assignment in attendance save/list APIs.
7. Test flows:
   - Admin assigns teacher to class/section.
   - Teacher logs in and sees assigned class only.
   - Teacher marks attendance.
   - Admin sees dashboard and history.
   - Student logs in and sees own attendance only.

## Data Model Summary

Tables:
- `auth.users`
  - Admin and teacher accounts.
- `user_roles`
  - Existing table for admin/teacher role.
- `students`
  - Existing student master table.
- `teacher_assignments`
  - Teacher to class/section/year mapping.
- `student_auth`
  - Student login credentials.
- `attendance_records`
  - Daily attendance per student.
- `holiday_calendar`
  - Admin-created school holiday dates.

Key constraints:
- `teacher_assignments.teacher_id` can appear multiple times for multi-class attendance access.
- `teacher_assignments(class, section, academic_year)` is unique.
- `attendance_records(student_id, attendance_date)` is unique.

## Status Values

Allowed attendance statuses:

```text
present
absent
late
holiday
```

Percentage formula:

```text
attendance_percentage = present / (present + absent + late) * 100
```

Holiday should not count in working-day percentage unless school policy says otherwise.
