-- Region lifecycle is independent from environment.
--
-- environment:
--   production | test
--
-- lifecycle_status:
--   onboarding | active | suspended
--
-- Existing known regions are backfilled explicitly by UUID so that demo /
-- onboarding regions are not accidentally treated as live production regions.

alter table public.regions
    add column if not exists lifecycle_status text;

alter table public.regions
    add column if not exists activated_at timestamptz;

alter table public.regions
    add column if not exists activated_by_user_id uuid
        references auth.users(id);

alter table public.regions
    add column if not exists lifecycle_updated_at timestamptz;

alter table public.regions
    add column if not exists lifecycle_updated_by_user_id uuid
        references auth.users(id);


-- Explicit backfill of the known deployed regions.
--
-- Active production regions.

update public.regions
set
    lifecycle_status = 'active',
    activated_at = coalesce(activated_at, now()),
    lifecycle_updated_at = coalesce(lifecycle_updated_at, now())
where id in (
    '96c9eef9-3b6e-4365-86cd-51dbeccf231a', -- F3 Aggieland
    '0925d0c8-2c87-4d9c-882a-86efa0ce1c5a'  -- F3 Old 300
);


-- Existing production demos / regions still being onboarded.

update public.regions
set
    lifecycle_status = 'onboarding',
    activated_at = null,
    activated_by_user_id = null,
    lifecycle_updated_at = coalesce(lifecycle_updated_at, now())
where id in (
    'c05cd413-7171-4017-aacb-61db1e8ca200', -- F3 North Katy
    '7298b632-4d9a-542f-b65d-d416e5c1e631'  -- F3 West Houston
);


-- Sandbox remains a fully usable TEST workspace.

update public.regions
set
    lifecycle_status = 'active',
    activated_at = coalesce(activated_at, now()),
    lifecycle_updated_at = coalesce(lifecycle_updated_at, now())
where id = '8872e939-5691-450f-ba32-293a8b77d029';


-- Fail loudly if some unexpected deployed region was not explicitly classified.
--
-- We do not want a migration silently deciding that an unknown region is active.

do $$
begin
    if exists (
        select 1
        from public.regions
        where lifecycle_status is null
    ) then
        raise exception
            'Region lifecycle migration found unclassified regions. Classify them explicitly before continuing.';
    end if;
end;
$$;


alter table public.regions
    alter column lifecycle_status set default 'onboarding';

alter table public.regions
    alter column lifecycle_status set not null;


alter table public.regions
    drop constraint if exists regions_lifecycle_status_check;

alter table public.regions
    add constraint regions_lifecycle_status_check
    check (
        lifecycle_status in (
            'onboarding',
            'active',
            'suspended'
        )
    );


alter table public.regions
    drop constraint if exists regions_lifecycle_activation_check;

alter table public.regions
    add constraint regions_lifecycle_activation_check
    check (
        (
            lifecycle_status = 'onboarding'
            and activated_at is null
        )
        or
        (
            lifecycle_status in ('active', 'suspended')
            and activated_at is not null
        )
    );


-- New regions must explicitly opt into reporting during activation.
alter table public.regions
    alter column include_in_reporting set default false;


-- Lifecycle audit timestamp should always have a value going forward.
update public.regions
set lifecycle_updated_at = now()
where lifecycle_updated_at is null;

alter table public.regions
    alter column lifecycle_updated_at set default now();

alter table public.regions
    alter column lifecycle_updated_at set not null;


-- Small authoritative helper for consumers that only need to know
-- whether a region is operational.
create or replace function public.region_is_active(
    p_region_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.regions r
        where r.id = p_region_id
          and r.lifecycle_status = 'active'
    );
$$;