-- Student leave requests setup for Supabase/PostgreSQL.
-- Allows students to apply leave from mobile app and keeps an auditable request trail.

create extension if not exists pgcrypto;

create table if not exists public.student_leave_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class text not null,
  section text not null,
  roll_no integer not null,
  academic_year text not null,
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
  constraint student_leave_requests_date_check check (to_date >= from_date)
);

create index if not exists idx_student_leave_requests_student_id
  on public.student_leave_requests (student_id);

create index if not exists idx_student_leave_requests_status
  on public.student_leave_requests (status);

create index if not exists idx_student_leave_requests_from_date
  on public.student_leave_requests (from_date desc);

create index if not exists idx_student_leave_requests_academic_year
  on public.student_leave_requests (academic_year);

create or replace function public.set_student_leave_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_student_leave_requests_updated_at on public.student_leave_requests;
create trigger trg_student_leave_requests_updated_at
before insert or update on public.student_leave_requests
for each row execute function public.set_student_leave_requests_updated_at();

alter table public.student_leave_requests enable row level security;

grant all on table public.student_leave_requests to service_role;
grant select on table public.student_leave_requests to authenticated;

drop policy if exists "student_leave_requests_service_role_all" on public.student_leave_requests;
create policy "student_leave_requests_service_role_all"
on public.student_leave_requests
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
