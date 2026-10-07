begin;

alter table public.courses
add column if not exists course_dates date[];

alter table public.courses
add column if not exists application_deadline timestamptz;

-- 기존 단일 날짜를 한 개짜리 배열로 옮깁니다.
update public.courses
set course_dates = array[course_date]
where course_dates is null
   or cardinality(course_dates) = 0;

-- 기존 교육의 신청 마감은 현재 동작(교육일 전날 17:00, 한국 시간)을 그대로 보존합니다.
update public.courses
set application_deadline = (
  (course_date - 1) + time '17:00:00'
) at time zone 'Asia/Seoul'
where application_deadline is null;

alter table public.courses
alter column course_dates set not null;

alter table public.courses
alter column application_deadline set not null;

-- 배열이 비어 있지 않고 날짜순이며 중복이 없는지 검사합니다.
create or replace function public.course_dates_are_sorted_unique(value date[])
returns boolean
language sql
immutable
strict
parallel safe
as $$
  select $1 = array(
    select distinct item
    from unnest($1) as dates(item)
    order by item
  );
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'courses_course_dates_valid_check'
      and conrelid = 'public.courses'::regclass
  ) then
    alter table public.courses
    add constraint courses_course_dates_valid_check
    check (
      cardinality(course_dates) > 0
      and public.course_dates_are_sorted_unique(course_dates)
      and course_date = course_dates[1]
    );
  end if;
end
$$;

commit;
