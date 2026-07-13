begin;

create table public.member_inviters (
    member_id uuid not null,
    inviter_member_id uuid not null,
    source text not null default 'app',
    source_metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),

    constraint member_inviters_pkey
        primary key (member_id, inviter_member_id),

    constraint member_inviters_member_id_fkey
        foreign key (member_id)
        references public.members(id)
        on delete cascade,

    constraint member_inviters_inviter_member_id_fkey
        foreign key (inviter_member_id)
        references public.members(id)
        on delete cascade,

    constraint member_inviters_no_self_reference
        check (member_id <> inviter_member_id)
);

create index member_inviters_inviter_member_id_idx
    on public.member_inviters (inviter_member_id);

alter table public.member_inviters enable row level security;

create policy member_inviters_select_region_access
on public.member_inviters
for select
to authenticated
using (
    exists (
        select 1
        from public.members invited_member
        join public.region_access ra
          on ra.region_id = invited_member.region_id
        where invited_member.id = member_inviters.member_id
          and ra.user_id = auth.uid()
    )
    or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'superadmin'
    )
);

insert into public.member_inviters (
    member_id,
    inviter_member_id,
    source,
    source_metadata
)
select
    invited_member.id,
    inviter_member.id,
    'legacy_scalar_backfill',
    jsonb_build_object(
        'source_table', 'members',
        'source_column', 'invited_by_id'
    )
from public.members invited_member
join public.members inviter_member
  on inviter_member.id = invited_member.invited_by_id
where invited_member.invited_by_id is not null
  and invited_member.id <> invited_member.invited_by_id
on conflict (member_id, inviter_member_id) do nothing;

commit;