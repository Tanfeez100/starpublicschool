-- Teacher to class/section assignment setup for Supabase.
-- Run this in Supabase SQL Editor before using the teacher assignment UI.

create table if not exists public.teacher_assignments (
  teacher_id uuid primary key references auth.users(id) on delete cascade,
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

create index if not exists idx_teacher_assignments_class_section
  on public.teacher_assignments (class, section);

create or replace function public.set_teacher_assignments_updated_at()
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
for each row
execute function public.set_teacher_assignments_updated_at();

alter table public.teacher_assignments enable row level security;

drop policy if exists "teacher_assignments_service_role_all" on public.teacher_assignments;
create policy "teacher_assignments_service_role_all"
on public.teacher_assignments
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
