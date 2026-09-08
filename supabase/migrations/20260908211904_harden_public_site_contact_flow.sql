alter table public.region_public_site_contact_submissions
    add column if not exists notification_status text not null default 'pending',
    add column if not exists notification_sent_at timestamptz,
    add column if not exists notification_error text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'region_public_site_contact_notification_status'
    ) then
        alter table public.region_public_site_contact_submissions
            add constraint region_public_site_contact_notification_status
            check (
                notification_status in (
                    'pending',
                    'sent',
                    'failed'
                )
            );
    end if;
end;
$$;


create table if not exists public.region_public_site_contact_rate_events (
    id bigint generated always as identity primary key,
    key_hash text not null,
    created_at timestamptz not null default now()
);

create index if not exists region_public_site_contact_rate_events_key_created_idx
    on public.region_public_site_contact_rate_events (
        key_hash,
        created_at desc
    );

alter table public.region_public_site_contact_rate_events
    enable row level security;

revoke all
    on table public.region_public_site_contact_rate_events
    from public, anon, authenticated;


create or replace function public.consume_public_site_contact_rate_limit(
    p_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_ten_minute_count integer;
    v_day_count integer;
begin
    if p_key_hash is null or char_length(trim(p_key_hash)) < 32 then
        raise exception 'Invalid rate limit key.';
    end if;

    /*
     * Serialize checks for this visitor so concurrent requests
     * cannot trivially race past the limit.
     */
    perform pg_advisory_xact_lock(
        hashtextextended(
            p_key_hash,
            0
        )
    );

    select count(*)
    into v_ten_minute_count
    from public.region_public_site_contact_rate_events
    where key_hash = p_key_hash
      and created_at >= now() - interval '10 minutes';

    select count(*)
    into v_day_count
    from public.region_public_site_contact_rate_events
    where key_hash = p_key_hash
      and created_at >= now() - interval '24 hours';

    if v_ten_minute_count >= 3 then
        return jsonb_build_object(
            'allowed', false,
            'reason', 'short_window'
        );
    end if;

    if v_day_count >= 10 then
        return jsonb_build_object(
            'allowed', false,
            'reason', 'daily_window'
        );
    end if;

    insert into public.region_public_site_contact_rate_events (
        key_hash
    )
    values (
        p_key_hash
    );

    /*
     * Opportunistic cleanup. At our scale this is enough for now
     * and prevents the table from growing forever.
     */
    delete from public.region_public_site_contact_rate_events
    where created_at < now() - interval '48 hours';

    return jsonb_build_object(
        'allowed', true
    );
end;
$$;


revoke all
    on function public.consume_public_site_contact_rate_limit(text)
    from public, anon, authenticated;

grant execute
    on function public.consume_public_site_contact_rate_limit(text)
    to service_role;


/*
 * The browser will no longer call this RPC directly.
 * Only the Edge Function's service-role client should invoke it.
 */
revoke execute
    on function public.submit_public_region_contact(
        text,
        text,
        text,
        text,
        text,
        text,
        text
    )
    from anon, authenticated;

grant execute
    on function public.submit_public_region_contact(
        text,
        text,
        text,
        text,
        text,
        text,
        text
    )
    to service_role;