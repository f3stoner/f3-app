/*
 * Regional activity feed foundation.
 *
 * V1 supports one system-generated event:
 * session_completed.
 *
 * Interactive create-mode session commands will reconcile
 * the feed after the canonical session and related records
 * have been persisted.
 */

create table public.region_feed_events (
    id uuid primary key default gen_random_uuid(),

    region_id uuid not null
        references public.regions(id)
        on delete cascade,

    event_type text not null,

    occurred_at timestamptz not null,

    created_at timestamptz not null
        default now(),

    session_id uuid
        references public.sessions(id)
        on delete cascade,

    source_key text not null,

    constraint region_feed_events_event_type_check
        check (
            event_type in (
                'session_completed'
            )
        ),

    constraint region_feed_events_source_key_unique
        unique (source_key),

    constraint region_feed_events_session_completed_shape
        check (
            event_type <> 'session_completed'
            or session_id is not null
        )
);


/*
 * Supports deterministic feed pagination:
 *
 * order by occurred_at desc, id desc
 */
create index region_feed_events_region_cursor_idx
on public.region_feed_events (
    region_id,
    occurred_at desc,
    id desc
);


/*
 * Feed visibility follows workspace access.
 *
 * Regional participation alone does not grant workspace
 * access and therefore must not grant feed visibility.
 */
alter table public.region_feed_events
enable row level security;


create policy
"Users may read feed events in accessible regions"
on public.region_feed_events
for select
to authenticated
using (
    public.has_region_access(region_id)

    or exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and profile.role = 'superadmin'
    )
);


/*
 * Authenticated clients may read feed events but may not
 * write directly to the feed table.
 *
 * System-generated events are created through internal
 * security-definer reconciliation functions.
 */
revoke all
on public.region_feed_events
from anon, authenticated;

grant select
on public.region_feed_events
to authenticated;


/*
 * Reconcile the regional feed projection for one canonical
 * session.
 *
 * This function is intentionally idempotent. Repeated calls
 * for the same session produce at most one feed event.
 *
 * V1 occurrence semantics:
 * occurred_at represents when the session was successfully
 * logged through the interactive session command.
 */
create or replace function
public.reconcile_region_feed_for_session(
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
        source_key
    )
    values (
        canonical_session.region_id,
        'session_completed',
        transaction_timestamp(),
        canonical_session.id,
        'session_completed:' ||
            canonical_session.id::text
    )
    on conflict (source_key) do nothing;
end;
$function$;


/*
 * The helper is internal database infrastructure.
 *
 * Browser clients must never invoke it directly.
 */
revoke all
on function
public.reconcile_region_feed_for_session(uuid)
from public, anon, authenticated;