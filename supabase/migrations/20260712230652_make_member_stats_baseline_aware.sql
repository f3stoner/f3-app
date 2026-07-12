CREATE OR REPLACE FUNCTION public.rebuild_member_stats_for_region(target_region_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$begin
  delete from public.member_stats
  where region_id = target_region_id;

  insert into public.member_stats (
    region_id,
    member_id,
    total_posts,
    total_qs,
    posts_30_days,
    qs_30_days,
    posts_90_days,
    qs_90_days,
    last_post_date,
    last_q_date,
    fngs_eh,
    first_post_date,
    favorite_ao,
    updated_at
  )
  select
    m.region_id,
    m.id as member_id,

    coalesce(b.baseline_posts, 0)
    +
    count(distinct s.id) filter (
    where (
        coalesce(s.attendee_ids, '[]'::jsonb) ? m.id::text
        or exists (
        select 1
        from jsonb_array_elements(
            coalesce(s.fngs, '[]'::jsonb)
        ) as fng(fng_obj)
        where fng.fng_obj->>'memberId' = m.id::text
            or fng.fng_obj->>'member_id' = m.id::text
        )
    )
    and (
        b.id is null
        or s.date::date > b.baseline_date
    )
    ) as total_posts,

    coalesce(b.baseline_qs, 0)
    +
    count(distinct s.id) filter (
    where (
        m.id = any(coalesce(s.q_ids, '{}'::uuid[]))
        or s.q_id = m.id
    )
    and (
        b.id is null
        or s.date::date > b.baseline_date
    )
    ) as total_qs,

    count(distinct s.id) filter (
      where (
        coalesce(s.attendee_ids, '[]'::jsonb) ? m.id::text
        or exists (
          select 1
          from jsonb_array_elements(coalesce(s.fngs, '[]'::jsonb)) as fng(fng_obj)
          where fng.fng_obj->>'memberId' = m.id::text
             or fng.fng_obj->>'member_id' = m.id::text
        )
      )
      and s.date::date >= current_date - 30
    ) as posts_30_days,

    count(distinct s.id) filter (
      where (
        m.id = any(coalesce(s.q_ids, '{}'::uuid[]))
        or s.q_id = m.id
      )
      and s.date::date >= current_date - 30
    ) as qs_30_days,

    count(distinct s.id) filter (
      where (
        coalesce(s.attendee_ids, '[]'::jsonb) ? m.id::text
        or exists (
          select 1
          from jsonb_array_elements(coalesce(s.fngs, '[]'::jsonb)) as fng(fng_obj)
          where fng.fng_obj->>'memberId' = m.id::text
             or fng.fng_obj->>'member_id' = m.id::text
        )
      )
      and s.date::date >= current_date - 90
    ) as posts_90_days,

    count(distinct s.id) filter (
      where (
        m.id = any(coalesce(s.q_ids, '{}'::uuid[]))
        or s.q_id = m.id
      )
      and s.date::date >= current_date - 90
    ) as qs_90_days,

    max(s.date::date) filter (
      where (
        coalesce(s.attendee_ids, '[]'::jsonb) ? m.id::text
        or exists (
          select 1
          from jsonb_array_elements(coalesce(s.fngs, '[]'::jsonb)) as fng(fng_obj)
          where fng.fng_obj->>'memberId' = m.id::text
             or fng.fng_obj->>'member_id' = m.id::text
        )
      )
    ) as last_post_date,

    max(s.date::date) filter (
      where m.id = any(coalesce(s.q_ids, '{}'::uuid[]))
         or s.q_id = m.id
    ) as last_q_date,

    count(*) filter (
      where exists (
        select 1
        from jsonb_array_elements(coalesce(s.fngs, '[]'::jsonb)) as fng(fng_obj)
        where fng.fng_obj->>'invitedById' = m.id::text
           or fng.fng_obj->>'invited_by_id' = m.id::text
      )
    ) as fngs_eh,

    coalesce(
      m.first_post_date::date,
      min(s.date::date) filter (
        where (
          coalesce(s.attendee_ids, '[]'::jsonb) ? m.id::text
          or exists (
            select 1
            from jsonb_array_elements(coalesce(s.fngs, '[]'::jsonb)) as fng(fng_obj)
            where fng.fng_obj->>'memberId' = m.id::text
               or fng.fng_obj->>'member_id' = m.id::text
          )
        )
      )
    ) as first_post_date,

    (
      select s2.ao_name
      from public.sessions s2
      where s2.region_id = m.region_id
        and (
          coalesce(s2.attendee_ids, '[]'::jsonb) ? m.id::text
          or exists (
            select 1
            from jsonb_array_elements(coalesce(s2.fngs, '[]'::jsonb)) as fng(fng_obj)
            where fng.fng_obj->>'memberId' = m.id::text
               or fng.fng_obj->>'member_id' = m.id::text
          )
        )
      group by s2.ao_name
      order by count(*) desc, max(s2.date::date) desc
      limit 1
    ) as favorite_ao,

    now()
  from public.members m
  left join lateral (
    select
        msb.id,
        msb.baseline_posts,
        msb.baseline_qs,
        msb.baseline_date
    from public.member_stats_baselines msb
    where msb.region_id = m.region_id
        and msb.member_id = m.id
    order by msb.baseline_date desc, msb.created_at desc
    limit 1
    ) b on true
  left join public.sessions s
    on s.region_id = m.region_id
    and (
      coalesce(s.attendee_ids, '[]'::jsonb) ? m.id::text
      or exists (
        select 1
        from jsonb_array_elements(coalesce(s.fngs, '[]'::jsonb)) as fng(fng_obj)
        where fng.fng_obj->>'memberId' = m.id::text
           or fng.fng_obj->>'member_id' = m.id::text
      )
      or m.id = any(coalesce(s.q_ids, '{}'::uuid[]))
      or s.q_id = m.id
      or exists (
        select 1
        from jsonb_array_elements(coalesce(s.fngs, '[]'::jsonb)) as fng(fng_obj)
        where fng.fng_obj->>'invitedById' = m.id::text
           or fng.fng_obj->>'invited_by_id' = m.id::text
      )
    )
  where m.region_id = target_region_id
  group by
    m.region_id,
    m.id,
    m.first_post_date,
    b.id,
    b.baseline_posts,
    b.baseline_qs,
    b.baseline_date;
end;
$function$;



create or replace function public.rebuild_member_stats_for_member(
  target_region_id uuid,
  target_member_id uuid
)
returns void
language plpgsql
security definer
as $function$
begin
  delete from public.member_stats
  where region_id = target_region_id
    and member_id = target_member_id;

  insert into public.member_stats (
    region_id,
    member_id,
    total_posts,
    total_qs,
    posts_30_days,
    qs_30_days,
    posts_90_days,
    qs_90_days,
    last_post_date,
    last_q_date,
    fngs_eh,
    first_post_date,
    favorite_ao,
    updated_at
  )
  select
    m.region_id,
    m.id,

    coalesce(b.baseline_posts, 0)
    +
    count(distinct s.id) filter (
      where (
        coalesce(s.attendee_ids, '[]'::jsonb) ? m.id::text
        or exists (
          select 1
          from jsonb_array_elements(
            coalesce(s.fngs, '[]'::jsonb)
          ) as fng(fng_obj)
          where fng.fng_obj->>'memberId' = m.id::text
             or fng.fng_obj->>'member_id' = m.id::text
        )
      )
      and (
        b.id is null
        or s.date::date > b.baseline_date
      )
    ) as total_posts,

    coalesce(b.baseline_qs, 0)
    +
    count(distinct s.id) filter (
    where (
        m.id = any(coalesce(s.q_ids, '{}'::uuid[]))
        or s.q_id = m.id
    )
    and (
        b.id is null
        or s.date::date > b.baseline_date
    )
    ) as total_qs,

    count(distinct s.id) filter (
      where (
        coalesce(s.attendee_ids, '[]'::jsonb) ? m.id::text
        or exists (
          select 1
          from jsonb_array_elements(
            coalesce(s.fngs, '[]'::jsonb)
          ) as fng(fng_obj)
          where fng.fng_obj->>'memberId' = m.id::text
             or fng.fng_obj->>'member_id' = m.id::text
        )
      )
      and s.date::date >= current_date - 30
    ) as posts_30_days,

    count(distinct s.id) filter (
      where m.id = any(coalesce(s.q_ids, '{}'::uuid[]))
        and s.date::date >= current_date - 30
    ) as qs_30_days,

    count(distinct s.id) filter (
      where (
        coalesce(s.attendee_ids, '[]'::jsonb) ? m.id::text
        or exists (
          select 1
          from jsonb_array_elements(
            coalesce(s.fngs, '[]'::jsonb)
          ) as fng(fng_obj)
          where fng.fng_obj->>'memberId' = m.id::text
             or fng.fng_obj->>'member_id' = m.id::text
        )
      )
      and s.date::date >= current_date - 90
    ) as posts_90_days,

    count(distinct s.id) filter (
      where m.id = any(coalesce(s.q_ids, '{}'::uuid[]))
        and s.date::date >= current_date - 90
    ) as qs_90_days,

    max(s.date::date) filter (
      where (
        coalesce(s.attendee_ids, '[]'::jsonb) ? m.id::text
        or exists (
          select 1
          from jsonb_array_elements(
            coalesce(s.fngs, '[]'::jsonb)
          ) as fng(fng_obj)
          where fng.fng_obj->>'memberId' = m.id::text
             or fng.fng_obj->>'member_id' = m.id::text
        )
      )
    ) as last_post_date,

    max(s.date::date) filter (
        where (
            m.id = any(coalesce(s.q_ids, '{}'::uuid[]))
            or s.q_id = m.id
        )
    ) as last_q_date,

    count(*) filter (
      where exists (
        select 1
        from jsonb_array_elements(
          coalesce(s.fngs, '[]'::jsonb)
        ) as fng(fng_obj)
        where fng.fng_obj->>'invitedById' = m.id::text
           or fng.fng_obj->>'invited_by_id' = m.id::text
      )
    ) as fngs_eh,

    coalesce(
      m.first_post_date::date,
      min(s.date::date) filter (
        where (
          coalesce(s.attendee_ids, '[]'::jsonb) ? m.id::text
          or exists (
            select 1
            from jsonb_array_elements(
              coalesce(s.fngs, '[]'::jsonb)
            ) as fng(fng_obj)
            where fng.fng_obj->>'memberId' = m.id::text
               or fng.fng_obj->>'member_id' = m.id::text
          )
        )
      )
    ) as first_post_date,

    (
      select s2.ao_name
      from public.sessions s2
      where s2.region_id = m.region_id
        and (
          coalesce(s2.attendee_ids, '[]'::jsonb) ? m.id::text
          or exists (
            select 1
            from jsonb_array_elements(
              coalesce(s2.fngs, '[]'::jsonb)
            ) as fng(fng_obj)
            where fng.fng_obj->>'memberId' = m.id::text
               or fng.fng_obj->>'member_id' = m.id::text
          )
        )
      group by s2.ao_name
      order by count(*) desc, max(s2.date::date) desc
      limit 1
    ) as favorite_ao,

    now()

  from public.members m

  left join lateral (
    select
      msb.id,
      msb.baseline_posts,
      msb.baseline_qs,
      msb.baseline_date
    from public.member_stats_baselines msb
    where msb.region_id = m.region_id
      and msb.member_id = m.id
    order by
      msb.baseline_date desc,
      msb.created_at desc
    limit 1
  ) b on true

  left join public.sessions s
    on s.region_id = m.region_id
    and (
      coalesce(s.attendee_ids, '[]'::jsonb) ? m.id::text
      or exists (
        select 1
        from jsonb_array_elements(
          coalesce(s.fngs, '[]'::jsonb)
        ) as fng(fng_obj)
        where fng.fng_obj->>'memberId' = m.id::text
           or fng.fng_obj->>'member_id' = m.id::text
      )
      or m.id = any(coalesce(s.q_ids, '{}'::uuid[]))
      or exists (
        select 1
        from jsonb_array_elements(
          coalesce(s.fngs, '[]'::jsonb)
        ) as fng(fng_obj)
        where fng.fng_obj->>'invitedById' = m.id::text
           or fng.fng_obj->>'invited_by_id' = m.id::text
      )
    )

  where m.region_id = target_region_id
    and m.id = target_member_id

  group by
    m.region_id,
    m.id,
    m.first_post_date,
    b.id,
    b.baseline_posts,
    b.baseline_qs,
    b.baseline_date;
end;
$function$;