begin;

create table if not exists
public.participant_region_invitation_dismissals (
    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    region_id uuid not null
        references public.regions(id)
        on delete cascade,

    dismissed_at timestamptz not null
        default now(),

    primary key (
        user_id,
        region_id
    )
);

alter table
public.participant_region_invitation_dismissals
enable row level security;

create policy
"Users can view their own invitation dismissals"
on public.participant_region_invitation_dismissals
for select
to authenticated
using (
    user_id = auth.uid()
);

create policy
"Users can create their own invitation dismissals"
on public.participant_region_invitation_dismissals
for insert
to authenticated
with check (
    user_id = auth.uid()
);

create policy
"Users can delete their own invitation dismissals"
on public.participant_region_invitation_dismissals
for delete
to authenticated
using (
    user_id = auth.uid()
);

create or replace function
public.dismiss_participant_region_invitation(
    p_region_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_user_id uuid;
    v_member_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception
            'Authentication is required.'
            using errcode = '42501';
    end if;

    if p_region_id is null then
        raise exception
            'Region ID is required.'
            using errcode = '22004';
    end if;

    select p.member_id
    into v_member_id
    from public.profiles p
    where p.id = v_user_id;

    if v_member_id is null then
        raise exception
            'Your account is not linked to a canonical member.'
            using errcode = '23514';
    end if;

    /*
     * Only allow dismissal of a legitimate participant-based
     * access opportunity.
     */
    if not exists (
        select 1
        from public.region_participants rp
        where rp.region_id = p_region_id
          and rp.member_id = v_member_id
          and rp.status = 'active'
    ) then
        raise exception
            'No participant-based region invitation exists.'
            using errcode = '42501';
    end if;

    insert into
    public.participant_region_invitation_dismissals (
        user_id,
        region_id,
        dismissed_at
    )
    values (
        v_user_id,
        p_region_id,
        now()
    )
    on conflict (
        user_id,
        region_id
    )
    do update
    set dismissed_at =
        excluded.dismissed_at;
end;
$function$;

alter function
public.dismiss_participant_region_invitation(uuid)
owner to postgres;

revoke all
on function
public.dismiss_participant_region_invitation(uuid)
from public, anon, authenticated;

grant execute
on function
public.dismiss_participant_region_invitation(uuid)
to authenticated;

/*
 * Replace participant invitation loader so dismissed
 * opportunities remain retrievable in Settings while the
 * dashboard can filter them out.
 */

 drop function if exists
public.load_my_participant_region_invitations();

create or replace function
public.load_my_participant_region_invitations()
returns table (
    region_id uuid,
    region_name text,
    participant_id uuid,
    first_participated_on date,
    last_participated_on date,
    participant_sources text[],
    dashboard_dismissed boolean,
    dashboard_dismissed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_user_id uuid;
    v_member_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception
            'Authentication is required.'
            using errcode = '42501';
    end if;

    select
        p.member_id
    into
        v_member_id
    from public.profiles p
    where p.id = v_user_id;

    if v_member_id is null then
        return;
    end if;

    return query
    select
        r.id,
        r.name,
        rp.id,
        rp.first_participated_on,
        rp.last_participated_on,

        coalesce(
            rp.sources,
            '{}'::text[]
        ),

        dismissal.user_id is not null,

        dismissal.dismissed_at

    from public.region_participants rp

    join public.regions r
        on r.id = rp.region_id

    left join
    public.participant_region_invitation_dismissals dismissal
        on dismissal.user_id =
            v_user_id
       and dismissal.region_id =
            rp.region_id

    where rp.member_id =
            v_member_id

      and rp.status =
            'active'

      and not exists (
          select 1
          from public.region_access ra
          where ra.user_id =
                    v_user_id
            and ra.region_id =
                    rp.region_id
      )

    order by
        rp.last_participated_on
            desc nulls last,
        r.name;
end;
$function$;

alter function
public.load_my_participant_region_invitations()
owner to postgres;

revoke all
on function
public.load_my_participant_region_invitations()
from public, anon, authenticated;

grant execute
on function
public.load_my_participant_region_invitations()
to authenticated;

notify pgrst, 'reload schema';

commit;