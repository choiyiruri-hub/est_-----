-- 이 파일은 기존 응답을 유지하면서 이후 만족도 응답을 익명 방식으로 전환합니다.
-- Supabase SQL Editor에서 파일 전체를 한 번 실행하세요.

begin;

alter table public.survey_responses
  add column if not exists gender text,
  add column if not exists age integer;

alter table public.survey_responses enable row level security;

-- 과거 respondent_name 값은 그대로 두고 신규 응답에 NULL을 저장할 수 있게 합니다.
alter table public.survey_responses
  alter column respondent_name drop not null;

-- respondent_name이 포함된 UNIQUE 제약조건만 이름과 무관하게 찾아 제거합니다.
-- 기본키와 respondent_name이 포함되지 않은 다른 제약조건은 건드리지 않습니다.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select constraint_info.conname
    from pg_constraint as constraint_info
    join pg_class as table_info
      on table_info.oid = constraint_info.conrelid
    join pg_namespace as schema_info
      on schema_info.oid = table_info.relnamespace
    join pg_attribute as column_info
      on column_info.attrelid = table_info.oid
     and column_info.attname = 'respondent_name'
    where schema_info.nspname = 'public'
      and table_info.relname = 'survey_responses'
      and constraint_info.contype = 'u'
      and column_info.attnum = any (constraint_info.conkey)
  loop
    execute format(
      'alter table public.survey_responses drop constraint %I',
      constraint_record.conname
    );
  end loop;
end;
$$;

-- 제약조건에 연결되지 않은 별도 UNIQUE 인덱스 중 respondent_name을 키로 쓰는 것만 제거합니다.
do $$
declare
  index_record record;
begin
  for index_record in
    select index_info.relname as index_name
    from pg_index as index_meta
    join pg_class as table_info
      on table_info.oid = index_meta.indrelid
    join pg_namespace as schema_info
      on schema_info.oid = table_info.relnamespace
    join pg_class as index_info
      on index_info.oid = index_meta.indexrelid
    join pg_attribute as column_info
      on column_info.attrelid = table_info.oid
     and column_info.attname = 'respondent_name'
    where schema_info.nspname = 'public'
      and table_info.relname = 'survey_responses'
      and index_meta.indisunique
      and not index_meta.indisprimary
      and not exists (
        select 1
        from pg_constraint as linked_constraint
        where linked_constraint.conindid = index_meta.indexrelid
      )
      and (
        column_info.attnum = any (index_meta.indkey)
        or (
          index_meta.indexprs is not null
          and pg_get_expr(index_meta.indexprs, index_meta.indrelid) ~* '\mrespondent_name\M'
        )
      )
  loop
    execute format('drop index public.%I', index_record.index_name);
  end loop;
end;
$$;

alter table public.survey_responses
  drop constraint if exists survey_responses_gender_check,
  drop constraint if exists survey_responses_age_check;

-- 기존 행의 NULL은 허용하고 값이 있는 경우에만 허용 범위를 검사합니다.
alter table public.survey_responses
  add constraint survey_responses_gender_check
    check (gender is null or gender in ('남성', '여성')),
  add constraint survey_responses_age_check
    check (age is null or age between 1 and 120);

-- 기존 행은 그대로 두면서 이 migration 이후 생성되는 행에는 성별과 나이를 필수화합니다.
create or replace function public.validate_new_anonymous_survey_response()
returns trigger
language plpgsql
as $$
begin
  if new.respondent_name is not null then
    raise exception using
      errcode = '23514',
      message = '익명 만족도 응답에는 이름을 저장할 수 없습니다.';
  end if;

  -- applicant_id 컬럼이 있는 기존 구조에서도 신규 응답은 신청자와 연결하지 않습니다.
  if to_jsonb(new) ->> 'applicant_id' is not null then
    raise exception using
      errcode = '23514',
      message = '익명 만족도 응답은 신청자와 연결할 수 없습니다.';
  end if;

  if new.gender is null or new.gender not in ('남성', '여성') then
    raise exception using
      errcode = '23514',
      message = '성별은 남성 또는 여성 중 하나여야 합니다.';
  end if;

  if new.age is null or new.age < 1 or new.age > 120 then
    raise exception using
      errcode = '23514',
      message = '나이는 1세 이상 120세 이하의 정수여야 합니다.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_new_anonymous_survey_response() from public, anon, authenticated;

drop trigger if exists validate_new_anonymous_survey_response_insert
on public.survey_responses;
create trigger validate_new_anonymous_survey_response_insert
before insert on public.survey_responses
for each row
execute function public.validate_new_anonymous_survey_response();

-- 수강생용 공개 설문은 식별정보 없이 유효한 성별·나이 응답만 새로 저장할 수 있습니다.
drop policy if exists "survey_responses_public_anonymous_insert" on public.survey_responses;
create policy "survey_responses_public_anonymous_insert"
on public.survey_responses
for insert
to anon, authenticated
with check (
  respondent_name is null
  and to_jsonb(survey_responses) ->> 'applicant_id' is null
  and gender in ('남성', '여성')
  and age between 1 and 120
);

-- 로그인한 관리자 결과 화면은 응답을 조회할 수 있고, 익명 사용자는 조회할 수 없습니다.
drop policy if exists "survey_responses_authenticated_select" on public.survey_responses;
create policy "survey_responses_authenticated_select"
on public.survey_responses
for select
to authenticated
using (true);

grant usage on schema public to anon, authenticated;
grant insert on table public.survey_responses to anon, authenticated;
grant select on table public.survey_responses to authenticated;

comment on column public.survey_responses.gender is '익명 만족도 응답자의 성별(남성/여성), 기존 응답은 NULL 허용';
comment on column public.survey_responses.age is '익명 만족도 응답자의 나이(1~120), 기존 응답은 NULL 허용';

commit;

-- 실행 결과에서 컬럼, NULL 허용 여부, 남아 있는 UNIQUE 항목과 검증 트리거를 확인합니다.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'survey_responses'
  and column_name in ('id', 'course_id', 'respondent_name', 'gender', 'age')
order by ordinal_position;

select constraint_name, constraint_type
from information_schema.table_constraints
where table_schema = 'public'
  and table_name = 'survey_responses'
order by constraint_type, constraint_name;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'survey_responses'
order by indexname;

select trigger_name, event_manipulation, action_timing
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'survey_responses'
order by trigger_name;

select policyname, roles, cmd, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'survey_responses'
order by cmd, policyname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('survey_responses', 'survey_answers')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
