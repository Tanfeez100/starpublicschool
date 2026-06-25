-- Holiday calendar setup for Supabase.
-- Run this in Supabase SQL Editor before using admin holiday calendar UI.

create extension if not exists pgcrypto;

create table if not exists public.holiday_calendar (
  id uuid primary key default gen_random_uuid(),
  -- holiday_date is kept for old code compatibility; start_date/end_date are the source of truth.
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

alter table public.holiday_calendar
  add column if not exists holiday_date date,
  add column if not exists start_date date,
  add column if not exists end_date date;

alter table public.holiday_calendar
  alter column holiday_date drop not null;

update public.holiday_calendar
set
  start_date = coalesce(start_date, holiday_date, current_date),
  end_date = coalesce(end_date, holiday_date, start_date, current_date),
  holiday_date = coalesce(holiday_date, start_date, current_date)
where start_date is null
   or end_date is null
   or holiday_date is null;

alter table public.holiday_calendar
  alter column start_date set not null,
  alter column end_date set not null,
  alter column start_date set default current_date,
  alter column end_date set default current_date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'holiday_calendar_date_range_check'
      and conrelid = 'public.holiday_calendar'::regclass
  ) then
    alter table public.holiday_calendar
      add constraint holiday_calendar_date_range_check check (end_date >= start_date);
  end if;
end $$;

alter table public.holiday_calendar
  drop constraint if exists holiday_calendar_holiday_date_key;

drop index if exists public.holiday_calendar_holiday_date_key;
drop index if exists public.idx_holiday_calendar_unique_range_title;

delete from public.holiday_calendar a
using public.holiday_calendar b
where a.ctid < b.ctid
  and a.start_date = b.start_date
  and a.end_date = b.end_date
  and a.title = b.title;

create index if not exists idx_holiday_calendar_date
  on public.holiday_calendar (holiday_date);

create index if not exists idx_holiday_calendar_range
  on public.holiday_calendar (start_date, end_date);

create unique index if not exists idx_holiday_calendar_unique_range_title
  on public.holiday_calendar (start_date, end_date, title);

create or replace function public.set_holiday_calendar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.holiday_date = coalesce(new.holiday_date, new.start_date);
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_holiday_calendar_updated_at on public.holiday_calendar;
create trigger trg_holiday_calendar_updated_at
before insert or update on public.holiday_calendar
for each row execute function public.set_holiday_calendar_updated_at();

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
