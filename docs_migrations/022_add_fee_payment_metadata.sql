-- Add optional payment metadata to fee_payments so fee dashboard and notification history can read it safely.
-- Run this in Supabase SQL Editor on existing databases.

alter table public.fee_payments
  add column if not exists transaction_id text,
  add column if not exists receipt_no text;

create unique index if not exists idx_fee_payments_transaction_id_unique
  on public.fee_payments (transaction_id)
  where transaction_id is not null and transaction_id <> '';

comment on column public.fee_payments.transaction_id is 'Optional transaction or idempotency key for a payment';
comment on column public.fee_payments.receipt_no is 'Optional receipt number assigned to the payment';

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
