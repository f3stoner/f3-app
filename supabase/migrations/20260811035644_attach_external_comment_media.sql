create or replace function public.attach_external_comment_media(
    p_comment_id uuid,
    p_provider text,
    p_external_media_id text,
    p_external_url text,
    p_external_preview_url text default null,
    p_external_still_url text default null,
    p_display_order integer default 0
)
returns public.media_attachments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_profile public.profiles%rowtype;
    target_comment public.region_feed_comments%rowtype;
    created_attachment public.media_attachments%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_comment_id is null then
        raise exception 'Comment id is required';
    end if;

    if trim(coalesce(p_provider, '')) = '' then
        raise exception 'External media provider is required';
    end if;

    if trim(coalesce(p_external_media_id, '')) = '' then
        raise exception 'External media id is required';
    end if;

    if trim(coalesce(p_external_url, '')) = '' then
        raise exception 'External media URL is required';
    end if;

    select *
    into caller_profile
    from public.profiles
    where id = auth.uid();

    if caller_profile.id is null then
        raise exception 'Authenticated profile not found';
    end if;

    if caller_profile.member_id is null then
        raise exception 'A linked member is required';
    end if;

    select *
    into target_comment
    from public.region_feed_comments
    where id = p_comment_id
      and deleted_at is null;

    if target_comment.id is null then
        raise exception 'Comment not found';
    end if;

    if target_comment.member_id <> caller_profile.member_id
       and caller_profile.role <> 'superadmin' then
        raise exception 'Not authorized to attach media to this comment';
    end if;

    if lower(p_provider) <> 'giphy' then
        raise exception 'Unsupported external media provider';
    end if;

    insert into public.media_attachments (
        region_feed_comment_id,
        media_asset_id,
        media_source,
        external_provider,
        external_media_id,
        external_url,
        external_preview_url,
        external_still_url,
        display_order
    )
    values (
        p_comment_id,
        null,
        'external',
        lower(p_provider),
        p_external_media_id,
        p_external_url,
        p_external_preview_url,
        p_external_still_url,
        p_display_order
    )
    returning *
    into created_attachment;

    return created_attachment;
end;
$function$;