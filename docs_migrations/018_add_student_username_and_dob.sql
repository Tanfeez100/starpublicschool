-- Student username and date of birth setup.
-- Run this in Supabase SQL Editor on an existing database.
-- Keeps admission_number/admission_date for backward compatibility, but new UI should use username + DOB.

alter table public.students
  add column if not exists username text,
  add column if not exists date_of_birth date;

create unique index if not exists idx_students_username_unique
  on public.students (username)
  where username is not null and username <> '';

create index if not exists idx_students_date_of_birth
  on public.students (date_of_birth);

comment on column public.students.username is 'Auto-generated unique student login username';
comment on column public.students.date_of_birth is 'Student date of birth';

-- Refresh Supabase/PostgREST schema cache so the new columns show up quickly.
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
