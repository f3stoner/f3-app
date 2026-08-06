/*
 * Add one selectable reaction per member per regional feed event.
 */

create table public.region_feed_reactions (
    id uuid primary key default gen_random_uuid(),

    feed_event_id uuid not null
        references public.region_feed_events(id)
        on delete cascade,

    member_id uuid not null
        references public.members(id)
        on delete cascade,

    reaction_type text not null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint region_feed_reactions_type_check
    check (
        reaction_type in (
            'like',
            'strong',
            'fire',
            'applause',
            'heart'
        )
    ),

    constraint region_feed_reactions_member_event_unique
    unique (
        feed_event_id,
        member_id
    )
);

create index region_feed_reactions_event_idx
on public.region_feed_reactions (
    feed_event_id,
    reaction_type
);

create index region_feed_reactions_member_idx
on public.region_feed_reactions (
    member_id,
    created_at desc
);

alter table public.region_feed_reactions
enable row level security;


/*
 * Reactions are readable anywhere the underlying feed event
 * is readable.
 */

create policy
"Users may read reactions for accessible feed events"
on public.region_feed_reactions
for select
to authenticated
using (
    exists (
        select 1
        from public.region_feed_events feed_event
        where feed_event.id =
            region_feed_reactions.feed_event_id
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
 * Toggle or replace the authenticated member's reaction.
 *
 * - no existing reaction: insert;
 * - same reaction: remove;
 * - different reaction: replace.
 */
create or replace function public.set_region_feed_reaction(
    p_feed_event_id uuid,
    p_reaction_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    caller_profile public.profiles%rowtype;
    target_event public.region_feed_events%rowtype;
    existing_reaction public.region_feed_reactions%rowtype;
    result_action text;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;

    if p_feed_event_id is null then
        raise exception 'Feed event id is required';
    end if;

    if p_reaction_type not in (
        'like',
        'strong',
        'fire',
        'applause',
        'heart'
    ) then
        raise exception 'Invalid reaction type';
    end if;

    select *
    into caller_profile
    from public.profiles
    where id = auth.uid();

    if caller_profile.id is null then
        raise exception 'Authenticated profile not found';
    end if;

    if caller_profile.member_id is null then
        raise exception 'A linked member is required to react';
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
        raise exception 'Not authorized for this feed event';
    end if;

    select *
    into existing_reaction
    from public.region_feed_reactions
    where feed_event_id = p_feed_event_id
      and member_id = caller_profile.member_id
    for update;

    if existing_reaction.id is null then
        insert into public.region_feed_reactions (
            feed_event_id,
            member_id,
            reaction_type
        )
        values (
            p_feed_event_id,
            caller_profile.member_id,
            p_reaction_type
        );

        result_action := 'added';

    elsif existing_reaction.reaction_type =
        p_reaction_type
    then
        delete from public.region_feed_reactions
        where id = existing_reaction.id;

        result_action := 'removed';

    else
        update public.region_feed_reactions
        set
            reaction_type = p_reaction_type,
            updated_at = now()
        where id = existing_reaction.id;

        result_action := 'changed';
    end if;

    return jsonb_build_object(
        'action',
        result_action,
        'feedEventId',
        p_feed_event_id,
        'memberId',
        caller_profile.member_id,
        'reactionType',
        case
            when result_action = 'removed'
            then null
            else p_reaction_type
        end
    );
end;
$function$;

revoke all on function
public.set_region_feed_reaction(uuid, text)
from public;

grant execute on function
public.set_region_feed_reaction(uuid, text)
to authenticated;