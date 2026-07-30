begin;

-- =========================================================
-- CREATE MEMBER MERGE DRAFT
--
-- Creates durable merge provenance and captures immutable
-- snapshots of the two selected member identities.
--
-- This function does not preview or execute a merge and does
-- not modify any member-related production data.
-- =========================================================

create or replace function public.create_member_merge_draft(
    p_canonical_member_id uuid,
    p_duplicate_member_id uuid,
    p_notes text default null
)
returns public.member_merges
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor_user_id uuid;
    v_canonical_member public.members%rowtype;
    v_duplicate_member public.members%rowtype;
    v_merge public.member_merges%rowtype;
begin
    v_actor_user_id := auth.uid();

    if v_actor_user_id is null then
        raise exception
            'Authentication is required to create a member merge draft.'
            using errcode = '42501';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor_user_id
          and p.role = 'superadmin'
    ) then
        raise exception
            'Only a superadmin may create a member merge draft.'
            using errcode = '42501';
    end if;

    if p_canonical_member_id is null then
        raise exception
            'Canonical member ID is required.'
            using errcode = '22004';
    end if;

    if p_duplicate_member_id is null then
        raise exception
            'Duplicate member ID is required.'
            using errcode = '22004';
    end if;

    if p_canonical_member_id = p_duplicate_member_id then
        raise exception
            'Canonical and duplicate member IDs must be different.'
            using errcode = '23514';
    end if;

    -- Lock both member rows in deterministic UUID order. This
    -- prevents the snapshots from being captured while either
    -- identity is being changed by another transaction and
    -- avoids inconsistent lock ordering between concurrent calls.
    perform m.id
    from public.members m
    where m.id in (
        p_canonical_member_id,
        p_duplicate_member_id
    )
    order by m.id
    for update;

    select m.*
    into v_canonical_member
    from public.members m
    where m.id = p_canonical_member_id;

    if not found then
        raise exception
            'Canonical member % does not exist.',
            p_canonical_member_id
            using errcode = 'P0002';
    end if;

    select m.*
    into v_duplicate_member
    from public.members m
    where m.id = p_duplicate_member_id;

    if not found then
        raise exception
            'Duplicate member % does not exist.',
            p_duplicate_member_id
            using errcode = 'P0002';
    end if;

    insert into public.member_merges (
        canonical_member_id,
        duplicate_member_id,
        status,
        canonical_member_snapshot,
        duplicate_member_snapshot,
        notes,
        created_by_user_id
    )
    values (
        p_canonical_member_id,
        p_duplicate_member_id,
        'draft',
        to_jsonb(v_canonical_member),
        to_jsonb(v_duplicate_member),
        nullif(btrim(p_notes), ''),
        v_actor_user_id
    )
    returning *
    into v_merge;

    return v_merge;
end;
$$;

comment on function public.create_member_merge_draft(
    uuid,
    uuid,
    text
) is
    'Creates a draft canonical-member merge record and captures immutable snapshots of the selected members. Does not preview or execute the merge. Superadmin only.';

alter function public.create_member_merge_draft(
    uuid,
    uuid,
    text
)
owner to postgres;

revoke all
on function public.create_member_merge_draft(
    uuid,
    uuid,
    text
)
from public, anon, authenticated;

grant execute
on function public.create_member_merge_draft(
    uuid,
    uuid,
    text
)
to authenticated;

grant execute
on function public.create_member_merge_draft(
    uuid,
    uuid,
    text
)
to service_role;

notify pgrst, 'reload schema';

commit;