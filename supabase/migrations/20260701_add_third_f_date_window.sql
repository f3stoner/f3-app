-- Add date window support for Third F discussions.
-- Week Start remains the user-facing source of truth.
-- starts_on/expires_on are derived by the app.

alter table third_f_discussions
add column if not exists starts_on date,
add column if not exists expires_on date;

create or replace function public.save_third_f_discussion(
    p_id uuid,
    p_region_id uuid,
    p_week_start_date date,
    p_starts_on date,
    p_expires_on date,
    p_title text,
    p_type text,
    p_summary text,
    p_discussion text,
    p_link text,
    p_published boolean
)
returns third_f_discussions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    saved_discussion public.third_f_discussions;
begin
    insert into public.third_f_discussions (
        id,
        region_id,
        week_start_date,
        starts_on,
        expires_on,
        title,
        type,
        summary,
        discussion,
        link,
        published,
        created_by_user_id,
        updated_at
    )
    values (
        coalesce(p_id, gen_random_uuid()),
        p_region_id,
        p_week_start_date,
        p_starts_on,
        p_expires_on,
        nullif(trim(p_title), ''),
        coalesce(nullif(trim(p_type), ''), 'discussion'),
        nullif(trim(p_summary), ''),
        nullif(trim(p_discussion), ''),
        nullif(trim(p_link), ''),
        coalesce(p_published, false),
        auth.uid(),
        now()
    )
    on conflict (id)
    do update set
        week_start_date = excluded.week_start_date,
        starts_on = excluded.starts_on,
        expires_on = excluded.expires_on,
        title = excluded.title,
        type = excluded.type,
        summary = excluded.summary,
        discussion = excluded.discussion,
        link = excluded.link,
        published = excluded.published,
        updated_at = now()
    where public.third_f_discussions.region_id = p_region_id
    returning * into saved_discussion;

    return saved_discussion;
end;
$function$;