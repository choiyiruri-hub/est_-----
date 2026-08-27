begin;

alter table public.applications
add column if not exists contact_note text not null default '';

commit;
