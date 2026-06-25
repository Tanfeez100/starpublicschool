-- Student admission fields setup for Supabase.
-- Run this in Supabase SQL Editor before using Admission Number/Date in student forms.

alter table public.students
  add column if not exists admission_number text,
  add column if not exists admission_date date;

create unique index if not exists idx_students_admission_number_unique
  on public.students (admission_number)
  where admission_number is not null and admission_number <> '';

create index if not exists idx_students_admission_date
  on public.students (admission_date);

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

