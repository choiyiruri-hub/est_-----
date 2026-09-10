-- 관리자 만족도 결과 화면의 개별/전체 응답 삭제용 RPC입니다.
-- Supabase SQL Editor에서 이 파일을 직접 실행해야 기능이 활성화됩니다.
-- 답변과 응답만 삭제하며 교육, 신청자, 만족도 주제와 문항은 변경하지 않습니다.

begin;

create or replace function public.delete_survey_response(
  p_course_id text,
  p_response_id text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  if auth.role() is distinct from 'authenticated' then
    raise exception using
      errcode = '42501',
      message = '로그인한 관리자만 만족도 응답을 삭제할 수 있습니다.';
  end if;

  -- course_id와 response_id를 함께 확인해 다른 교육의 답변을 건드리지 않습니다.
  delete from public.survey_answers as answer
  using public.survey_responses as response
  where answer.response_id = response.id
    and response.id::text = p_response_id
    and response.course_id::text = p_course_id;

  delete from public.survey_responses as response
  where response.id::text = p_response_id
    and response.course_id::text = p_course_id;

  get diagnostics deleted_count = row_count;
  if deleted_count <> 1 then
    raise exception using
      errcode = 'P0002',
      message = '현재 교육에서 삭제할 만족도 응답을 찾지 못했습니다.';
  end if;

  return deleted_count;
end;
$$;

create or replace function public.delete_course_survey_responses(
  p_course_id text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  if auth.role() is distinct from 'authenticated' then
    raise exception using
      errcode = '42501',
      message = '로그인한 관리자만 만족도 응답을 삭제할 수 있습니다.';
  end if;

  -- 먼저 현재 교육 응답에 연결된 답변만 삭제해 외래키 오류를 방지합니다.
  delete from public.survey_answers as answer
  using public.survey_responses as response
  where answer.response_id = response.id
    and response.course_id::text = p_course_id;

  delete from public.survey_responses as response
  where response.course_id::text = p_course_id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- 테이블 직접 DELETE는 허용하지 않고 검증된 RPC만 로그인 사용자에게 공개합니다.
revoke delete on table public.survey_answers, public.survey_responses from public, anon, authenticated;
revoke all on function public.delete_survey_response(text, text) from public, anon;
revoke all on function public.delete_course_survey_responses(text) from public, anon;
grant execute on function public.delete_survey_response(text, text) to authenticated;
grant execute on function public.delete_course_survey_responses(text) to authenticated;

comment on function public.delete_survey_response(text, text)
is '로그인한 관리자가 현재 교육의 단일 만족도 응답과 연결 답변을 원자적으로 삭제';
comment on function public.delete_course_survey_responses(text)
is '로그인한 관리자가 현재 교육의 전체 만족도 응답과 연결 답변을 원자적으로 삭제';

commit;

-- 실행 후 함수 권한을 확인합니다. anon에는 EXECUTE가 없어야 합니다.
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('delete_survey_response', 'delete_course_survey_responses')
order by routine_name, grantee;
