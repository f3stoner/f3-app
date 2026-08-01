begin;

create unique index if not exists
    region_access_user_region_unique
on public.region_access (
    user_id,
    region_id
);

commit;