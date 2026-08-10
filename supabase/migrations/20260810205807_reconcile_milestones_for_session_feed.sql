create or replace function public.reconcile_region_feed_milestones_for_session(
    p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
    canonical_session public.sessions%rowtype;

    milestone_values constant integer[] := array[
        10,
        25,
        50,
        75,
        100,
        150,
        200,
        250,
        300,
        400,
        500,
        750,
        1000
    ];
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
    with session_member_ids as (
        select attendee.member_id_text
        from jsonb_array_elements_text(
            coalesce(canonical_session.attendee_ids, '[]'::jsonb)
        ) as attendee(member_id_text)

        union

        select coalesce(
            fng.fng_obj ->> 'memberId',
            fng.fng_obj ->> 'member_id'
        )
        from jsonb_array_elements(
            coalesce(canonical_session.fngs, '[]'::jsonb)
        ) as fng(fng_obj)
        where coalesce(
            fng.fng_obj ->> 'memberId',
            fng.fng_obj ->> 'member_id'
        ) is not null
    ),

    affected_members as (
        select m.id as member_id
        from session_member_ids submitted
        join public.members m
          on m.id::text = submitted.member_id_text
    ),

    member_baselines as (
        select
            affected.member_id,
            coalesce(b.baseline_posts, 0)::integer as baseline_posts,
            b.baseline_date
        from affected_members affected
        left join lateral (
            select
                msb.baseline_posts,
                msb.baseline_date
            from public.member_stats_baselines msb
            where msb.region_id = canonical_session.region_id
              and msb.member_id = affected.member_id
            order by
                msb.baseline_date desc,
                msb.created_at desc
            limit 1
        ) b on true
    ),

    regional_post_events as (
        select
            s.id as session_id,
            s.date::date as session_date,
            s.created_at,
            attendee.member_id_text
        from public.sessions s
        cross join lateral jsonb_array_elements_text(
            coalesce(s.attendee_ids, '[]'::jsonb)
        ) as attendee(member_id_text)
        where s.region_id = canonical_session.region_id

        union

        select
            s.id as session_id,
            s.date::date as session_date,
            s.created_at,
            coalesce(
                fng.fng_obj ->> 'memberId',
                fng.fng_obj ->> 'member_id'
            ) as member_id_text
        from public.sessions s
        cross join lateral jsonb_array_elements(
            coalesce(s.fngs, '[]'::jsonb)
        ) as fng(fng_obj)
        where s.region_id = canonical_session.region_id
          and coalesce(
              fng.fng_obj ->> 'memberId',
              fng.fng_obj ->> 'member_id'
          ) is not null
    ),

    qualifying_posts as (
        select distinct
            baseline.member_id,
            baseline.baseline_posts,
            events.session_id,
            events.session_date,
            events.created_at
        from member_baselines baseline
        join regional_post_events events
          on events.member_id_text = baseline.member_id::text
        where baseline.baseline_date is null
           or events.session_date > baseline.baseline_date
    ),

    ranked_posts as (
        select
            posts.member_id,
            posts.session_id,
            posts.created_at,
            (
                posts.baseline_posts
                +
                row_number() over (
                    partition by posts.member_id
                    order by
                        posts.session_date,
                        posts.created_at,
                        posts.session_id
                )
            )::integer as ending_total
        from qualifying_posts posts
    ),

    crossings as (
        select
            ranked.member_id,
            ranked.session_id,
            ranked.created_at,
            ranked.ending_total
        from ranked_posts ranked
        where ranked.session_id = canonical_session.id
          and ranked.ending_total = any(milestone_values)
    )

    select
        canonical_session.region_id,
        'member_milestone',
        coalesce(
            crossing.created_at,
            canonical_session.date::date::timestamptz
        ),
        crossing.session_id,
        crossing.member_id,
        'member_milestone:' ||
            canonical_session.region_id::text || ':' ||
            crossing.member_id::text || ':posts:' ||
            crossing.ending_total::text,
        jsonb_build_object(
            'metric', 'posts',
            'milestone', crossing.ending_total,
            'startingTotal', crossing.ending_total - 1,
            'endingTotal', crossing.ending_total
        )
    from crossings crossing

    on conflict (source_key)
    do update set
        occurred_at = excluded.occurred_at,
        session_id = excluded.session_id,
        payload = excluded.payload;
end;
$function$;