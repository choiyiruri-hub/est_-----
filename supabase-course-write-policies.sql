begin;

-- 이 파일만 실행해도 교육 관련 정책이 완성되도록 RLS를 활성화합니다.
alter table public.courses enable row level security;
alter table public.course_survey_questions enable row level security;

-- 교육 목록과 신청 페이지에서 교육 정보를 조회할 수 있도록 허용합니다.
drop policy if exists "courses_public_select" on public.courses;
create policy "courses_public_select"
on public.courses
for select
to anon, authenticated
using (true);

-- 로그인한 관리자가 기존 화면에서 교육을 생성할 수 있도록 허용합니다.
drop policy if exists "courses_authenticated_insert" on public.courses;
create policy "courses_authenticated_insert"
on public.courses
for insert
to authenticated
with check (true);

-- 로그인한 관리자가 교육명, 일정, 정원 등의 정보를 수정할 수 있도록 허용합니다.
drop policy if exists "courses_authenticated_update" on public.courses;
create policy "courses_authenticated_update"
on public.courses
for update
to authenticated
using (true)
with check (true);

-- 교육 목록에 이미 존재하는 선택 삭제 기능을 유지합니다.
drop policy if exists "courses_authenticated_delete" on public.courses;
create policy "courses_authenticated_delete"
on public.courses
for delete
to authenticated
using (true);

-- 교육 신청 및 만족도 화면에서 해당 교육의 문항을 조회할 수 있도록 허용합니다.
drop policy if exists "course_questions_public_select" on public.course_survey_questions;
create policy "course_questions_public_select"
on public.course_survey_questions
for select
to anon, authenticated
using (true);

-- 새 교육 생성 시 공통 만족도 문항을 해당 교육에 복사할 수 있도록 허용합니다.
drop policy if exists "course_questions_authenticated_insert" on public.course_survey_questions;
create policy "course_questions_authenticated_insert"
on public.course_survey_questions
for insert
to authenticated
with check (true);

-- Data API 테이블 권한도 현재 관리자 화면에서 사용하는 작업에 맞춥니다.
grant usage on schema public to anon, authenticated;
grant select on table public.courses to anon;
grant select, insert, update, delete on table public.courses to authenticated;
grant select on table public.course_survey_questions to anon;
grant select, insert on table public.course_survey_questions to authenticated;

commit;
