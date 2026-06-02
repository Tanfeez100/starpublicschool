-- Seed demo students for all school classes.
-- Creates 2 sections (A, B) for every class and 5 active students per section.
-- Default classes: Nursery, LKG, UKG, 1, 2, 3, 4, 5, 6, 7, 8.
-- Total inserted if empty: 11 classes x 2 sections x 5 students = 110 students.
--
-- Safe to run more than once:
-- it skips any active student with the same class + section + academic_year + roll_no.

create extension if not exists pgcrypto;

do $$
declare
  v_academic_year text := '2026-27';
begin
  insert into public.students (
    name,
    father_name,
    mother_name,
    gender,
    class,
    section,
    roll_no,
    academic_year,
    status,
    left_date,
    mobile,
    address,
    uses_transport,
    transport_charge,
    aadhaar_card,
    pen_number,
    admission_number,
    admission_date,
    photo_url
  )
  select
    format('Student %s-%s-%s', c.class_name, s.section_name, r.roll_no) as name,
    format('Father %s-%s-%s', c.class_name, s.section_name, r.roll_no) as father_name,
    format('Mother %s-%s-%s', c.class_name, s.section_name, r.roll_no) as mother_name,
    case when r.roll_no::int % 2 = 0 then 'Female' else 'Male' end as gender,
    c.class_name as class,
    s.section_name as section,
    r.roll_no::text as roll_no,
    v_academic_year as academic_year,
    'active' as status,
    null as left_date,
    ('900' || lpad((c.class_index * 100 + s.section_index * 10 + r.roll_no)::text, 7, '0')) as mobile,
    format('Demo address, Class %s, Section %s', c.class_name, s.section_name) as address,
    false as uses_transport,
    null as transport_charge,
    lpad((700000000000::bigint + (c.class_index * 1000) + (s.section_index * 100) + r.roll_no)::text, 12, '0') as aadhaar_card,
    format('PEN%s%s%s', lpad(c.class_index::text, 2, '0'), s.section_name, lpad(r.roll_no::text, 2, '0')) as pen_number,
    format('ADM%s%s%s', lpad(c.class_index::text, 2, '0'), s.section_name, lpad(r.roll_no::text, 2, '0')) as admission_number,
    date '2026-04-01' as admission_date,
    null as photo_url
  from (
    values
      (1, 'Nursery'),
      (2, 'LKG'),
      (3, 'UKG'),
      (4, '1'),
      (5, '2'),
      (6, '3'),
      (7, '4'),
      (8, '5'),
      (9, '6'),
      (10, '7'),
      (11, '8')
  ) as c(class_index, class_name)
  cross join (
    values
      (1, 'A'),
      (2, 'B')
  ) as s(section_index, section_name)
  cross join generate_series(1, 5) as r(roll_no)
  where not exists (
    select 1
    from public.students existing
    where existing.class = c.class_name
      and existing.section = s.section_name
      and existing.academic_year = v_academic_year
      and existing.roll_no = r.roll_no::text
      and existing.status = 'active'
  );
end $$;

-- Verification:
-- select class, section, academic_year, count(*) as total_students
-- from public.students
-- where academic_year = '2026-27' and status = 'active'
-- group by class, section, academic_year
-- order by class, section;
