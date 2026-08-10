-- Parent-derived authorization helpers for generic media.

-- ============================================================
-- Q SLOT MEDIA
-- ============================================================

create or replace function public.can_manage_q_slot_media(
    p_q_slot_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.q_slots slot
        where slot.id = p_q_slot_id
          and (
              public.can_manage_ao_q_slots(
                  slot.ao_id,
                  slot.region_id
              )
              or (
                  public.has_region_access(
                      slot.region_id
                  )
                  and public.my_member_id() is not null
                  and slot.q_user_id =
                      public.my_member_id()
              )
          )
    );
$$;

revoke all on function public.can_manage_q_slot_media(uuid)
from public, anon;

grant execute on function public.can_manage_q_slot_media(uuid)
to authenticated;


-- ============================================================
-- SESSION MEDIA
-- Mirrors save_session_command update authority.
-- ============================================================

create or replace function public.can_manage_session_media(
    p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.sessions session_row
        join public.profiles profile
          on profile.id = auth.uid()
        where session_row.id = p_session_id
          and (
              profile.role = 'superadmin'

              or (
                  (
                      profile.region_id =
                          session_row.region_id
                      or exists (
                          select 1
                          from public.region_access access_row
                          where access_row.user_id =
                              auth.uid()
                            and access_row.region_id =
                                session_row.region_id
                      )
                  )
                  and (
                      session_row.created_by_user_id =
                          auth.uid()

                      or (
                          profile.member_id is not null
                          and (
                              (
                                  cardinality(
                                      coalesce(
                                          session_row.q_ids,
                                          '{}'::uuid[]
                                      )
                                  ) > 0
                                  and profile.member_id =
                                      any(session_row.q_ids)
                              )
                              or (
                                  cardinality(
                                      coalesce(
                                          session_row.q_ids,
                                          '{}'::uuid[]
                                      )
                                  ) = 0
                                  and session_row.q_id =
                                      profile.member_id
                              )
                          )
                      )

                      or (
                          profile.role in (
                              'slt',
                              'dataq'
                          )
                          and profile.region_id =
                              session_row.region_id
                      )

                      or exists (
                          select 1
                          from public.profile_region_positions position
                          where position.profile_id =
                              auth.uid()
                            and position.region_id =
                                session_row.region_id
                            and position.region_position in (
                                'nantan',
                                'weasel_shaker',
                                'first_f',
                                'second_f',
                                'third_f'
                            )
                      )

                      or (
                          session_row.ao_id is not null
                          and exists (
                              select 1
                              from public.profile_ao_permissions permission
                              where permission.profile_id =
                                  auth.uid()
                                and permission.region_id =
                                    session_row.region_id
                                and permission.ao_id =
                                    session_row.ao_id
                                and permission.ao_position in (
                                    'aoq',
                                    'ao_coq',
                                    'ao_data_q'
                                )
                          )
                      )
                  )
              )
          )
    );
$$;

revoke all on function public.can_manage_session_media(uuid)
from public, anon;

grant execute on function public.can_manage_session_media(uuid)
to authenticated;


-- ============================================================
-- COMMENT MEDIA
-- ============================================================

create or replace function public.can_manage_comment_media(
    p_comment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.region_feed_comments comment_row
        where comment_row.id = p_comment_id
          and comment_row.deleted_at is null
          and (
              comment_row.member_id =
                  public.my_member_id()
              or public.is_superadmin()
          )
    );
$$;

revoke all on function public.can_manage_comment_media(uuid)
from public, anon;

grant execute on function public.can_manage_comment_media(uuid)
to authenticated;


-- ============================================================
-- ANNOUNCEMENT MEDIA
-- ============================================================

create or replace function public.can_manage_announcement_media(
    p_announcement_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.announcements announcement
        where announcement.id = p_announcement_id
          and public.can_manage_region_content(
              announcement.region_id
          )
    );
$$;

revoke all on function public.can_manage_announcement_media(uuid)
from public, anon;

grant execute on function public.can_manage_announcement_media(uuid)
to authenticated;


-- ============================================================
-- MEDIA PARENT REGION RESOLVER
-- Exactly one parent must be supplied.
-- ============================================================

create or replace function public.media_parent_region_id(
    p_q_slot_id uuid default null,
    p_session_id uuid default null,
    p_region_feed_comment_id uuid default null,
    p_announcement_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    resolved_region_id uuid;
begin
    if num_nonnulls(
        p_q_slot_id,
        p_session_id,
        p_region_feed_comment_id,
        p_announcement_id
    ) <> 1 then
        raise exception 'Exactly one media parent is required';
    end if;

    if p_q_slot_id is not null then
        select slot.region_id
        into resolved_region_id
        from public.q_slots slot
        where slot.id = p_q_slot_id;

    elsif p_session_id is not null then
        select session_row.region_id
        into resolved_region_id
        from public.sessions session_row
        where session_row.id = p_session_id;

    elsif p_region_feed_comment_id is not null then
        select coalesce(
            feed_event.region_id,
            slot.region_id
        )
        into resolved_region_id
        from public.region_feed_comments comment_row
        left join public.region_feed_events feed_event
          on feed_event.id =
              comment_row.feed_event_id
        left join public.q_slots slot
          on slot.id =
              comment_row.q_slot_id
        where comment_row.id =
            p_region_feed_comment_id;

    elsif p_announcement_id is not null then
        select announcement.region_id
        into resolved_region_id
        from public.announcements announcement
        where announcement.id =
            p_announcement_id;
    end if;

    if resolved_region_id is null then
        raise exception 'Media parent not found';
    end if;

    return resolved_region_id;
end;
$$;

revoke all on function public.media_parent_region_id(
    uuid,
    uuid,
    uuid,
    uuid
)
from public, anon;

grant execute on function public.media_parent_region_id(
    uuid,
    uuid,
    uuid,
    uuid
)
to authenticated;