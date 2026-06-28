-- Student first-login password setup support.
-- Run this in Supabase SQL Editor on existing databases.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

do $$
begin
  if to_regclass('public.holiday_calendar') is not null then
    execute 'drop trigger if exists trg_holiday_calendar_updated_at on public.holiday_calendar';
    execute 'create trigger trg_holiday_calendar_updated_at before insert or update on public.holiday_calendar for each row execute function public.set_holiday_calendar_updated_at()';
  end if;
end $$;

alter table public.student_auth
  add column if not exists must_reset_password boolean not null default true;

update public.student_auth
set must_reset_password = coalesce(must_reset_password, true);

comment on column public.student_auth.must_reset_password is 'Whether student must set a new password after first DOB login';

-- Refresh Supabase/PostgREST schema cache so the new column is visible quickly.
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
