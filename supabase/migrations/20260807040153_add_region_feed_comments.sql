/*
 * Add flat comments to regional feed events.
 *
 * V1 deliberately supports:
 *
 * - one-level comments only;
 * - authenticated regional readers;
 * - comment creation by linked members;
 * - deletion of your own comments;
 * - no replies;
 * - no comment reactions;
 * - no edit history.
 */

create table public.region_feed_comments (
    id uuid primary key default gen_random_uuid(),

    feed_event_id uuid not null
        references public.region_feed_events(id)
        on delete cascade,

    member_id uuid not null
        references public.members(id)
        on delete cascade,

    body text not null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz null,

    constraint region_feed_comments_body_check
    check (
        length(trim(body)) > 0
        and length(body) <= 1000
    )
);

create index region_feed_comments_event_idx
on public.region_feed_comments (
    feed_event_id,
    created_at,
    id
)
where deleted_at is null;

create index region_feed_comments_member_idx
on public.region_feed_comments (
    member_id,
    created_at desc
);

alter table public.region_feed_comments
enable row level security;


/*
 * Comments are readable anywhere the underlying feed event
 * is readable.
 */

create policy
"Users may read comments for accessible feed events"
on public.region_feed_comments
for select
to authenticated
using (
    deleted_at is null
    and exists (
        select 1
        from public.region_feed_events feed_event
        where feed_event.id =
            region_feed_comments.feed_event_id
          and (
              public.has_region_access(
                  feed_event.region_id
              )
              or exists (
                  select 1
                  from public.profiles profile
                  where profile.id = auth.uid()
                    and profile.role = 'superadmin'
              )
          )
    )
);


/*
 * Add one comment to a readable regional feed event.
 *
 * Writes stay behind an RPC rather than direct table policies.
 */

create or replace function public.add_region_feed_comment(
    p_feed_event_id uuid,
    p_body text
)
returns public.region_feed_comments
language plpgsql
security definer
set search_path = public
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

    clean_body := trim(
        coalesce(
            p_body,
            ''
        )
    );

    if clean_body = '' then
        raise exception 'Comment body is required';
    end if;

    if length(clean_body) > 1000 then
        raise exception
            'Comment must be 1000 characters or fewer';
    end if;

    select *
    into caller_profile
    from public.profiles
    where id = auth.uid();

    if caller_profile.id is null then
        raise exception 'Authenticated profile not found';
    end if;

    if caller_profile.member_id is null then
        raise exception
            'A linked member is required to comment';
    end if;

    select *
    into target_event
    from public.region_feed_events
    where id = p_feed_event_id;

    if target_event.id is null then
        raise exception 'Feed event not found';
    end if;

    if not (
        public.has_region_access(
            target_event.region_id
        )
        or caller_profile.role = 'superadmin'
    ) then
        raise exception
            'Not authorized for this feed event';
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

revoke all on function
public.add_region_feed_comment(uuid, text)
from public;

grant execute on function
public.add_region_feed_comment(uuid, text)
to authenticated;


/*
 * Soft-delete one comment owned by the authenticated member.
 *
 * Superadmin may also remove a comment for moderation.
 */

create or replace function public.delete_region_feed_comment(
    p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
    caller_profile public.profiles%rowtype;
    target_comment public.region_feed_comments%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_comment_id is null then
        raise exception 'Comment id is required';
    end if;

    select *
    into caller_profile
    from public.profiles
    where id = auth.uid();

    if caller_profile.id is null then
        raise exception 'Authenticated profile not found';
    end if;

    select *
    into target_comment
    from public.region_feed_comments
    where id = p_comment_id
      and deleted_at is null
    for update;

    if target_comment.id is null then
        raise exception 'Comment not found';
    end if;

    if not (
        caller_profile.member_id =
            target_comment.member_id
        or caller_profile.role = 'superadmin'
    ) then
        raise exception
            'Not authorized to delete this comment';
    end if;

    update public.region_feed_comments
    set
        deleted_at = now(),
        updated_at = now()
    where id = p_comment_id;
end;
$function$;

revoke all on function
public.delete_region_feed_comment(uuid)
from public;

grant execute on function
public.delete_region_feed_comment(uuid)
to authenticated;