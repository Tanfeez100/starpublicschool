-- Rename class "Mother Care" to "Nursery" everywhere common class data is stored.
-- Run this once in Supabase SQL Editor.

do $$
declare
  target record;
begin
  for target in
    select table_schema, table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'class'
      and data_type in ('text', 'character varying', 'character')
  loop
    execute format(
      'update %I.%I set class = %L where trim(lower(class)) in (%L, %L, %L)',
      target.table_schema,
      target.table_name,
      'Nursery',
      'mother care',
      'mothercare',
      'mother-care'
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

