-- 신청자별 훈련비 선택값을 applications 테이블에 추가합니다.
-- Supabase SQL Editor에서 파일 전체를 실행하세요.
-- 기존 신청자 행과 다른 신청자 정보는 변경하지 않습니다.

begin;

alter table public.applications
  add column if not exists training_fee text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'applications_training_fee_check'
      and conrelid = 'public.applications'::regclass
  ) then
    alter table public.applications
      add constraint applications_training_fee_check
      check (
        training_fee is null
        or training_fee in ('50,000원', '75,000원', '대규모기업')
      );
  end if;
end
$$;

comment on column public.applications.training_fee
is '신청자별 훈련비 구분. NULL=미선택, 허용값=50,000원/75,000원/대규모기업';

commit;

-- 실행 후 컬럼과 제약조건을 확인합니다.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'applications'
  and column_name = 'training_fee';

select constraint_name, check_clause
from information_schema.check_constraints
where constraint_schema = 'public'
  and constraint_name = 'applications_training_fee_check';
