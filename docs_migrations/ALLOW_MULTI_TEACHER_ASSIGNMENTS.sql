-- Allow one teacher to be assigned to multiple class/section/year rows.
-- Run this once in Supabase SQL Editor if teacher_assignments was created with teacher_id as primary key.

create extension if not exists pgcrypto;

alter table public.teacher_assignments
  add column if not exists id uuid default gen_random_uuid();

update public.teacher_assignments
set id = gen_random_uuid()
where id is null;

alter table public.teacher_assignments
  alter column id set not null;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'teacher_assignments'
      and constraint_name = 'teacher_assignments_pkey'
  ) then
    alter table public.teacher_assignments
      drop constraint teacher_assignments_pkey;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'teacher_assignments'
      and constraint_name = 'teacher_assignments_pkey'
  ) then
    alter table public.teacher_assignments
      add constraint teacher_assignments_pkey primary key (id);
  end if;
end $$;

create unique index if not exists teacher_assignments_unique_class_section_year_idx
  on public.teacher_assignments (class, section, academic_year);

create index if not exists idx_teacher_assignments_teacher_id
  on public.teacher_assignments (teacher_id);
