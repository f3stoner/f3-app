-- REVIEW ONLY. Run only after migration 20261011170000 is applied.
\set ON_ERROR_STOP on

begin;

do $guard$
begin
    if not exists (
        select 1
        from public.profiles p
        join public.members m on m.id = p.member_id
        join public.regions r on r.id = p.region_id
        where p.id = '1a45b8fa-b4d7-4d48-aad5-d2aec8579f80'::uuid
          and p.role = 'slt'
          and m.id = '0ec36c8a-3354-5b95-9b94-27013a04c3e6'::uuid
          and m.region_id = p.region_id
          and r.id = '7298b632-4d9a-542f-b65d-d416e5c1e631'::uuid
          and r.slug = 'west-houston'
          and r.environment = 'production'
    ) then
        raise exception 'DOGE home profile, member, role, or West Houston region changed';
    end if;

    if not exists (
        select 1 from public.profile_region_positions
        where profile_id = '1a45b8fa-b4d7-4d48-aad5-d2aec8579f80'::uuid
          and region_id = '7298b632-4d9a-542f-b65d-d416e5c1e631'::uuid
          and region_position = 'regional_admin'
    ) then
        raise exception 'DOGE no longer has West Houston regional_admin authority';
    end if;

    if not exists (
        select 1 from public.regions
        where id = '8872e939-5691-450f-ba32-293a8b77d029'::uuid
          and slug = 'sandbox'
          and environment = 'test'
    ) then
        raise exception 'Sandbox region guard failed';
    end if;
end
$guard$;

insert into public.region_access (user_id, region_id)
values (
    '1a45b8fa-b4d7-4d48-aad5-d2aec8579f80'::uuid,
    '8872e939-5691-450f-ba32-293a8b77d029'::uuid
)
on conflict (user_id, region_id) do nothing;

insert into public.profile_region_positions (
    profile_id,
    region_id,
    region_position,
    created_by_user_id
)
values (
    '1a45b8fa-b4d7-4d48-aad5-d2aec8579f80'::uuid,
    '8872e939-5691-450f-ba32-293a8b77d029'::uuid,
    'regional_admin',
    'a2072e94-56ee-447c-aeb3-e820e1fc4c4d'::uuid
)
on conflict (profile_id, region_id, region_position) do nothing;

do $verify$
begin
    if not exists (
        select 1 from public.region_access
        where user_id = '1a45b8fa-b4d7-4d48-aad5-d2aec8579f80'::uuid
          and region_id = '8872e939-5691-450f-ba32-293a8b77d029'::uuid
    ) then
        raise exception 'DOGE Sandbox region_access was not created';
    end if;

    if not exists (
        select 1 from public.profile_region_positions
        where profile_id = '1a45b8fa-b4d7-4d48-aad5-d2aec8579f80'::uuid
          and region_id = '8872e939-5691-450f-ba32-293a8b77d029'::uuid
          and region_position = 'regional_admin'
    ) then
        raise exception 'DOGE Sandbox regional_admin assignment was not created';
    end if;

    if (select region_id from public.profiles where id = '1a45b8fa-b4d7-4d48-aad5-d2aec8579f80')
       is distinct from '7298b632-4d9a-542f-b65d-d416e5c1e631'::uuid then
        raise exception 'DOGE home region changed unexpectedly';
    end if;
end
$verify$;

commit;

