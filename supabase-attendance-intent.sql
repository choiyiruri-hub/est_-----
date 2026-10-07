begin;

alter table public.applications
add column if not exists attendance_intent text not null default '미정';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'applications_attendance_intent_check'
      and conrelid = 'public.applications'::regclass
  ) then
    alter table public.applications
    add constraint applications_attendance_intent_check
    check (attendance_intent in ('미정', '참석', '불참'));
  end if;
end
$$;

commit;
