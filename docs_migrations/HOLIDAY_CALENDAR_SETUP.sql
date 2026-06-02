-- Holiday calendar setup for Supabase.
-- Run this in Supabase SQL Editor before using admin holiday calendar UI.

create extension if not exists pgcrypto;

create table if not exists public.holiday_calendar (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  title text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_holiday_calendar_date
  on public.holiday_calendar (holiday_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_holiday_calendar_updated_at on public.holiday_calendar;
create trigger trg_holiday_calendar_updated_at
before update on public.holiday_calendar
for each row execute function public.set_updated_at();

alter table public.holiday_calendar enable row level security;

grant all on table public.holiday_calendar to service_role;
grant select on table public.holiday_calendar to authenticated;

drop policy if exists "holiday_calendar_service_role_all" on public.holiday_calendar;
create policy "holiday_calendar_service_role_all"
on public.holiday_calendar
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- Refresh Supabase/PostgREST schema cache so API can see the new table quickly.
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- Quick verification:
-- select to_regclass('public.holiday_calendar') as holiday_calendar_table;
-- select count(*) from public.holiday_calendar;
