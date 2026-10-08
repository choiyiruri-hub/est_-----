-- 교육별 만족도 응답 접수 상태와 원자적 익명 제출을 추가합니다.
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행하세요.
-- 기존 교육/응답/답변은 삭제하거나 수정하지 않습니다.

begin;

-- 기존 교육과 새 교육은 모두 기본적으로 만족도 응답 접수 중입니다.
alter table public.courses
  add column if not exists survey_responses_open boolean not null default true;

update public.courses
set survey_responses_open = true
where survey_responses_open is null;

alter table public.courses
  alter column survey_responses_open set default true,
  alter column survey_responses_open set not null;

comment on column public.courses.survey_responses_open
is '교육별 만족도 응답 접수 여부. true=응답 접수 중, false=응답 마감';

alter table public.courses enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_answers enable row level security;

-- 공개 설문은 상태를 조회할 수 있지만 익명 사용자는 상태를 변경할 수 없습니다.
grant usage on schema public to anon, authenticated;
grant select on table public.courses to anon, authenticated;
revoke insert, update, delete on table public.courses from anon;
grant update (survey_responses_open) on table public.courses to authenticated;

-- 로그인한 관리자만 교육별 응답 상태를 변경할 수 있습니다.
-- 기존 courses_authenticated_update 정책과 같은 관리자 역할을 사용합니다.
drop policy if exists "courses_authenticated_survey_response_update" on public.courses;
create policy "courses_authenticated_survey_response_update"
on public.courses
for update
to authenticated
using (true)
with check (true);

-- 테이블 직접 INSERT 정책에도 현재 교육의 수동 접수 상태를 반영합니다.
-- 아래에서 직접 INSERT 권한도 회수하므로 실제 공개 제출은 원자적 RPC만 사용합니다.
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
  and exists (
    select 1
    from public.courses as course
    where course.id = survey_responses.course_id
      and course.survey_responses_open is true
  )
);

-- 서비스 역할 등 테이블을 직접 쓰는 경로도 마감 상태를 우회하지 못하게 합니다.
create or replace function public.ensure_survey_response_open()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1
  from public.courses as course
  where course.id = new.course_id
    and course.survey_responses_open is true
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = '현재 이 교육의 만족도 조사는 응답이 마감되었습니다.';
  end if;

  return new;
end;
$$;

revoke all on function public.ensure_survey_response_open() from public, anon, authenticated;

drop trigger if exists ensure_survey_response_open_insert
on public.survey_responses;
create trigger ensure_survey_response_open_insert
before insert on public.survey_responses
for each row
execute function public.ensure_survey_response_open();

-- 마감 뒤 기존 response_id에 답변만 직접 추가하는 경로도 차단합니다.
create or replace function public.ensure_survey_answer_open()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1
  from public.courses as course
  join public.survey_responses as response
    on response.course_id = course.id
  where response.id = new.response_id
    and course.survey_responses_open is true
  for share of course;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = '현재 이 교육의 만족도 조사는 응답이 마감되었습니다.';
  end if;

  return new;
end;
$$;

revoke all on function public.ensure_survey_answer_open() from public, anon, authenticated;

drop trigger if exists ensure_survey_answer_open_insert
on public.survey_answers;
create trigger ensure_survey_answer_open_insert
before insert on public.survey_answers
for each row
execute function public.ensure_survey_answer_open();

-- 응답 1건과 모든 문항 답변을 같은 트랜잭션에서 저장합니다.
-- 과정 행에 SHARE 잠금을 잡아 마감 변경과 제출이 순서대로 처리되게 합니다.
create or replace function public.submit_survey_response(
  p_course_id text,
  p_response_id text,
  p_gender text,
  p_age integer,
  p_answers jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course_id public.courses.id%type;
  v_response_id public.survey_responses.id%type;
  v_question_id public.course_survey_questions.id%type;
  v_question_type text;
  v_answer jsonb;
  v_score integer;
  v_text text;
  v_expected_count integer;
  v_seen_question_ids text[] := array[]::text[];
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    raise exception using
      errcode = '42501',
      message = '만족도 응답을 제출할 권한이 없습니다.';
  end if;

  if p_gender not in ('남성', '여성') then
    raise exception using
      errcode = '23514',
      message = '성별은 남성 또는 여성 중 하나여야 합니다.';
  end if;

  if p_age is null or p_age < 1 or p_age > 120 then
    raise exception using
      errcode = '23514',
      message = '나이는 1세 이상 120세 이하의 정수여야 합니다.';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception using
      errcode = '22023',
      message = '문항별 답변 형식이 올바르지 않습니다.';
  end if;

  select course.id
  into v_course_id
  from public.courses as course
  where course.id::text = p_course_id
    and course.survey_responses_open is true
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = '현재 이 교육의 만족도 조사는 응답이 마감되었습니다.';
  end if;

  select count(*)
  into v_expected_count
  from public.course_survey_questions as question
  where question.course_id = v_course_id;

  if v_expected_count = 0 or jsonb_array_length(p_answers) <> v_expected_count then
    raise exception using
      errcode = '23514',
      message = '현재 교육의 모든 만족도 문항에 응답해 주세요.';
  end if;

  begin
    v_response_id := p_response_id;
  exception
    when others then
      raise exception using
        errcode = '22023',
        message = '응답 ID 형식이 올바르지 않습니다.';
  end;

  insert into public.survey_responses (
    id,
    course_id,
    respondent_name,
    gender,
    age
  ) values (
    v_response_id,
    v_course_id,
    null,
    p_gender,
    p_age
  );

  for v_answer in
    select answer_item
    from jsonb_array_elements(p_answers) as answer_rows(answer_item)
  loop
    select question.id, question.question_type
    into v_question_id, v_question_type
    from public.course_survey_questions as question
    where question.course_id = v_course_id
      and question.id::text = v_answer ->> 'question_id';

    if not found then
      raise exception using
        errcode = '23514',
        message = '현재 교육에 속하지 않는 만족도 문항이 포함되어 있습니다.';
    end if;

    if v_question_id::text = any (v_seen_question_ids) then
      raise exception using
        errcode = '23514',
        message = '같은 만족도 문항의 답변이 중복되었습니다.';
    end if;
    v_seen_question_ids := array_append(v_seen_question_ids, v_question_id::text);

    if v_question_type = 'score' then
      begin
        v_score := nullif(v_answer ->> 'score_value', '')::integer;
      exception
        when others then
          v_score := null;
      end;
      if v_score is null or v_score < 1 or v_score > 5 then
        raise exception using
          errcode = '23514',
          message = '점수형 문항은 1점부터 5점 사이로 응답해야 합니다.';
      end if;
      v_text := null;
    elsif v_question_type = 'text' then
      v_score := null;
      v_text := nullif(trim(v_answer ->> 'text_value'), '');
      if v_text is null then
        raise exception using
          errcode = '23514',
          message = '주관식 문항의 답변을 입력해 주세요.';
      end if;
    else
      raise exception using
        errcode = '23514',
        message = '지원하지 않는 만족도 문항 형식입니다.';
    end if;

    insert into public.survey_answers (
      response_id,
      question_id,
      score_value,
      text_value
    ) values (
      v_response_id,
      v_question_id,
      v_score,
      v_text
    );
  end loop;

  return v_response_id::text;
end;
$$;

-- 공개 클라이언트는 원자적 RPC로만 제출합니다.
-- 응답 또는 답변 테이블을 직접 호출해 일부 행만 저장하는 경로는 차단합니다.
revoke insert on table public.survey_responses, public.survey_answers from public, anon, authenticated;
revoke all on function public.submit_survey_response(text, text, text, integer, jsonb) from public;
grant execute on function public.submit_survey_response(text, text, text, integer, jsonb) to anon, authenticated;

comment on function public.submit_survey_response(text, text, text, integer, jsonb)
is '교육별 수동 접수 상태를 잠금 후 재확인하고 익명 응답과 모든 답변을 원자적으로 저장';

commit;

-- 실행 후 상태 컬럼, 트리거, RPC 권한과 직접 INSERT 권한을 확인합니다.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'courses'
  and column_name = 'survey_responses_open';

select trigger_name, event_object_table, event_manipulation, action_timing
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in (
    'ensure_survey_response_open_insert',
    'ensure_survey_answer_open_insert'
  )
order by trigger_name;

select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'submit_survey_response'
order by grantee;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('courses', 'survey_responses', 'survey_answers')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
