begin;

-- 교육별 만족도 문항 편집에 필요한 권한을 추가합니다.
-- 공통 문항, 만족도 응답, 문항별 답변 데이터는 변경하지 않습니다.
alter table public.course_survey_questions enable row level security;

drop policy if exists "course_questions_authenticated_update" on public.course_survey_questions;
create policy "course_questions_authenticated_update"
on public.course_survey_questions
for update
to authenticated
using (true)
with check (true);

drop policy if exists "course_questions_authenticated_delete" on public.course_survey_questions;
create policy "course_questions_authenticated_delete"
on public.course_survey_questions
for delete
to authenticated
using (true);

grant select, insert, update, delete on table public.course_survey_questions to authenticated;

-- 답변이 연결된 교육별 문항은 DB 수준에서도 삭제할 수 없게 보호합니다.
-- 답변이 있는 문항의 유형은 유지하되 문구, 주제, 순서는 수정할 수 있습니다.
create or replace function public.protect_answered_course_survey_question()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1
      from public.survey_answers
      where question_id = old.id
    ) then
      raise exception using
        errcode = '23503',
        message = '답변이 있는 만족도 문항은 삭제할 수 없습니다.';
    end if;
    return old;
  end if;

  if new.question_type is distinct from old.question_type
     and exists (
       select 1
       from public.survey_answers
       where question_id = old.id
     ) then
    raise exception using
      errcode = '23503',
      message = '답변이 있는 만족도 문항은 유형을 변경할 수 없습니다.';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_answered_course_survey_question() from public, anon, authenticated;

drop trigger if exists protect_answered_course_survey_question_delete
on public.course_survey_questions;
create trigger protect_answered_course_survey_question_delete
before delete on public.course_survey_questions
for each row
execute function public.protect_answered_course_survey_question();

drop trigger if exists protect_answered_course_survey_question_type_update
on public.course_survey_questions;
create trigger protect_answered_course_survey_question_type_update
before update of question_type on public.course_survey_questions
for each row
execute function public.protect_answered_course_survey_question();

commit;

-- 실행 후 UPDATE/DELETE 정책과 보호 트리거가 생성됐는지 확인합니다.
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'course_survey_questions'
order by cmd, policyname;

select trigger_name, event_manipulation, event_object_table, action_timing
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'course_survey_questions'
order by trigger_name, event_manipulation;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'course_survey_questions'
  and grantee = 'authenticated'
order by privilege_type;
