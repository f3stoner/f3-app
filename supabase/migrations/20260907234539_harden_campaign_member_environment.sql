begin;


/* =========================================================
   CAMPAIGN ENROLLMENTS
   ========================================================= */

create or replace function public.enforce_campaign_enrollment_environment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_region_id uuid;
begin
    select c.region_id
    into v_region_id
    from public.campaigns c
    where c.id = new.campaign_id;

    if v_region_id is null then
        raise exception
            'Campaign % does not exist',
            new.campaign_id
            using errcode = '23503';
    end if;

    if not public.member_is_eligible_for_region(
        new.member_id,
        v_region_id
    ) then
        raise exception
            'Member % is not eligible for campaign region %',
            new.member_id,
            v_region_id
            using errcode = '23514';
    end if;

    return new;
end;
$function$;

drop trigger if exists
    campaign_enrollments_environment_guard
on public.campaign_enrollments;

create trigger campaign_enrollments_environment_guard
before insert or update
on public.campaign_enrollments
for each row
execute function public.enforce_campaign_enrollment_environment();


/* =========================================================
   CAMPAIGN CONTRIBUTIONS
   ========================================================= */

create or replace function public.enforce_campaign_contribution_environment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_region_id uuid;
begin
    select c.region_id
    into v_region_id
    from public.campaigns c
    where c.id = new.campaign_id;

    if v_region_id is null then
        raise exception
            'Campaign % does not exist',
            new.campaign_id
            using errcode = '23503';
    end if;

    if not public.member_is_eligible_for_region(
        new.member_id,
        v_region_id
    ) then
        raise exception
            'Member % is not eligible for campaign region %',
            new.member_id,
            v_region_id
            using errcode = '23514';
    end if;

    return new;
end;
$function$;

drop trigger if exists
    campaign_contributions_environment_guard
on public.campaign_contributions;

create trigger campaign_contributions_environment_guard
before insert or update
on public.campaign_contributions
for each row
execute function public.enforce_campaign_contribution_environment();


/* =========================================================
   MEMBER ACTIVITY LEDGER
   ========================================================= */

create or replace function public.enforce_member_activity_environment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if not public.member_is_eligible_for_region(
        new.member_id,
        new.region_id
    ) then
        raise exception
            'Member % is not eligible for activity region %',
            new.member_id,
            new.region_id
            using errcode = '23514';
    end if;

    return new;
end;
$function$;

drop trigger if exists
    member_activity_entries_environment_guard
on public.member_activity_entries;

create trigger member_activity_entries_environment_guard
before insert or update
on public.member_activity_entries
for each row
execute function public.enforce_member_activity_environment();


commit;