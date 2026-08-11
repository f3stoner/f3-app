create or replace function public.add_region_feed_comment(
    p_feed_event_id uuid,
    p_body text
)
returns public.region_feed_comments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_profile public.profiles%rowtype;
    target_event public.region_feed_events%rowtype;
    clean_body text;
    created_comment public.region_feed_comments%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_feed_event_id is null then
        raise exception 'Feed event id is required';
    end if;

    clean_body := trim(coalesce(p_body, ''));

    if length(clean_body) > 1000 then
        raise exception 'Comment must be 1000 characters or fewer';
    end if;

    select *
    into caller_profile
    from public.profiles
    where id = auth.uid();

    if caller_profile.id is null then
        raise exception 'Authenticated profile not found';
    end if;

    if caller_profile.member_id is null then
        raise exception 'A linked member is required to comment';
    end if;

    select *
    into target_event
    from public.region_feed_events
    where id = p_feed_event_id;

    if target_event.id is null then
        raise exception 'Feed event not found';
    end if;

    if not (
        public.has_region_access(target_event.region_id)
        or caller_profile.role = 'superadmin'
    ) then
        raise exception 'Not authorized for this feed event';
    end if;

    insert into public.region_feed_comments (
        feed_event_id,
        member_id,
        body
    )
    values (
        p_feed_event_id,
        caller_profile.member_id,
        clean_body
    )
    returning *
    into created_comment;

    return created_comment;
end;
$function$;