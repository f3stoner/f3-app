/*
 * Add first-Q leadership achievements to the regional activity feed.
 */

alter table public.region_feed_events
drop constraint region_feed_events_event_type_check;

alter table public.region_feed_events
add constraint region_feed_events_event_type_check
check (
    event_type in (
        'session_completed',
        'member_milestone',
        'announcement_published',
        'fng_welcomed',
        'vq_earned'
    )
);

alter table public.region_feed_events
add constraint region_feed_events_vq_shape
check (
    event_type <> 'vq_earned'
    or (
        session_id is not null
        and member_id is not null
    )
);


/*
 * Create one VQ event for each member whose first credited
 * regional Q lead is the supplied session.
 */
create or replace function public.reconcile_region_feed_vqs_for_session(
    p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
    canonical_session public.sessions%rowtype;
begin
    if p_session_id is null then
        raise exception 'Session id is required';
    end if;

    select *
    into canonical_session
    from public.sessions
    where id = p_session_id;

    if canonical_session.id is null then
        raise exception 'Session not found';
    end if;

    insert into public.region_feed_events (
        region_id,
        event_type,
        occurred_at,
        session_id,
        member_id,
        source_key,
        payload
    )
    with session_q_members as (
        /*
         * Current multi-Q representation.
         */
        select distinct submitted.member_id
        from unnest(
            coalesce(
                canonical_session.q_ids,
                '{}'::uuid[]
            )
        ) as submitted(member_id)

        union

        /*
         * Legacy single-Q representation.
         *
         * UNION prevents duplicate credit when q_id is also
         * present in q_ids.
         */
        select canonical_session.q_id
        where canonical_session.q_id is not null
    ),

    regional_q_events as (
        /*
         * Current multi-Q representation across the region.
         */
        select
            session_row.id as session_id,
            submitted.member_id
        from public.sessions session_row
        cross join lateral unnest(
            coalesce(
                session_row.q_ids,
                '{}'::uuid[]
            )
        ) as submitted(member_id)
        where session_row.region_id =
            canonical_session.region_id

        union

        /*
         * Legacy single-Q representation across the region.
         */
        select
            session_row.id as session_id,
            session_row.q_id as member_id
        from public.sessions session_row
        where session_row.region_id =
            canonical_session.region_id
          and session_row.q_id is not null
    ),

    first_q_members as (
        select session_q.member_id
        from session_q_members session_q
        join regional_q_events q_event
          on q_event.member_id =
              session_q.member_id
        group by session_q.member_id
        having count(
            distinct q_event.session_id
        ) = 1
        and bool_or(
            q_event.session_id =
                canonical_session.id
        )
    )

    select
        canonical_session.region_id,
        'vq_earned',

        to_timestamp(
            canonical_session.created_at / 1000.0
        ),

        canonical_session.id,
        first_q.member_id,

        'vq_earned:' ||
            canonical_session.region_id::text ||
            ':' ||
            first_q.member_id::text,

        jsonb_build_object(
            'qNumber',
            1,
            'aoName',
            canonical_session.ao_name
        )
    from first_q_members first_q

    on conflict (source_key) do nothing;
end;
$function$;

revoke all on function
public.reconcile_region_feed_vqs_for_session(uuid)
from public, anon, authenticated;