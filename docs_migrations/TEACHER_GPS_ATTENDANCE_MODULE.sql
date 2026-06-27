-- Teacher Management & GPS Attendance Module
-- Run this in Supabase SQL editor before using /api/teacher-attendance.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

do $$ begin
  create type teacher_attendance_status as enum (
    'present_provisional',
    'present',
    'late',
    'half_day',
    'absent',
    'leave',
    'holiday',
    'checkout_missing',
    'rejected'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists teacher_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id text unique,
  full_name text not null default '',
  mobile text,
  email text,
  gender text,
  date_of_birth date,
  qualification text,
  designation text,
  department text,
  joining_date date,
  address text,
  emergency_contact text,
  photo_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  username text unique,
  must_reset_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

create table if not exists teacher_attendance_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid,
  school_name text not null default 'Star Public School',
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  radius_meters integer not null default 150 check (radius_meters > 0),
  gps_accuracy_meters integer not null default 80 check (gps_accuracy_meters > 0),
  school_start_time time not null default '07:00',
  school_end_time time not null default '13:00',
  grace_minutes integer not null default 15 check (grace_minutes >= 0),
  checkout_deadline time not null default '14:00',
  minimum_working_minutes integer not null default 180 check (minimum_working_minutes >= 0),
  late_after_minutes integer not null default 15 check (late_after_minutes >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create unique index if not exists teacher_attendance_settings_one_active
on teacher_attendance_settings ((is_active))
where is_active = true;

create table if not exists teacher_attendance_records (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete restrict,
  school_id uuid,
  attendance_date date not null,
  status teacher_attendance_status not null default 'present_provisional',
  check_in_at timestamptz,
  check_in_latitude numeric(10,7),
  check_in_longitude numeric(10,7),
  check_in_accuracy numeric(8,2),
  check_in_distance_meters numeric(10,2),
  check_out_at timestamptz,
  check_out_latitude numeric(10,7),
  check_out_longitude numeric(10,7),
  check_out_accuracy numeric(8,2),
  check_out_distance_meters numeric(10,2),
  working_minutes integer not null default 0,
  device_id text,
  checkout_missing_reason text,
  checkout_missing_remarks text,
  checkout_request_status text not null default 'none' check (checkout_request_status in ('none', 'pending', 'approved', 'rejected')),
  admin_remarks text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  unique (teacher_id, attendance_date)
);

create index if not exists teacher_attendance_records_date_idx
on teacher_attendance_records (attendance_date desc);

create index if not exists teacher_attendance_records_teacher_date_idx
on teacher_attendance_records (teacher_id, attendance_date desc);

create index if not exists teacher_attendance_records_status_idx
on teacher_attendance_records (status);

create table if not exists teacher_leave_requests (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete restrict,
  leave_type text not null,
  from_date date not null,
  to_date date not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_remarks text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  check (to_date >= from_date)
);

create index if not exists teacher_leave_requests_teacher_date_idx
on teacher_leave_requests (teacher_id, from_date desc, to_date desc);

create index if not exists teacher_leave_requests_status_idx
on teacher_leave_requests (status);

create table if not exists teacher_attendance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid,
  attendance_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor_id uuid,
  actor_role text,
  created_at timestamptz not null default now()
);

create index if not exists teacher_attendance_audit_teacher_idx
on teacher_attendance_audit_logs (teacher_id, created_at desc);

create index if not exists teacher_attendance_audit_attendance_idx
on teacher_attendance_audit_logs (attendance_id, created_at desc);

create table if not exists teacher_notifications (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists teacher_notifications_teacher_idx
on teacher_notifications (teacher_id, is_read, created_at desc);

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
