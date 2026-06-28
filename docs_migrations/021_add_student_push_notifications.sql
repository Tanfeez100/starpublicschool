-- Student push notification support for bill generation and payment alerts.
-- Run this in Supabase SQL editor after the student auth schema is available.

create extension if not exists pgcrypto;

create table if not exists public.student_push_tokens (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  push_token text not null unique,
  platform text,
  device_id text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_push_tokens_student_id
  on public.student_push_tokens (student_id);

create index if not exists idx_student_push_tokens_active
  on public.student_push_tokens (student_id, is_active, last_seen_at desc);

create table if not exists public.student_notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  notification_type text not null default 'general',
  source_type text,
  source_id uuid,
  title text not null,
  body text not null,
  notification_data jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'queued',
  is_read boolean not null default false,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_notifications_student_created
  on public.student_notifications (student_id, created_at desc);

create index if not exists idx_student_notifications_student_read
  on public.student_notifications (student_id, is_read, created_at desc);

create index if not exists idx_student_notifications_source
  on public.student_notifications (source_type, source_id);

alter table public.student_push_tokens enable row level security;
alter table public.student_notifications enable row level security;

grant all on table public.student_push_tokens to service_role;
grant all on table public.student_notifications to service_role;

drop policy if exists "student_push_tokens_service_role_all" on public.student_push_tokens;
create policy "student_push_tokens_service_role_all"
on public.student_push_tokens
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "student_notifications_service_role_all" on public.student_notifications;
create policy "student_notifications_service_role_all"
on public.student_notifications
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

