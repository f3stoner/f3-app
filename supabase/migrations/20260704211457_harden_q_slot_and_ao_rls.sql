-- RLS v1 hardening for AOs and Q slots only.
-- Intentionally does not modify planned_workouts policies yet.

create or replace function public.has_region_access(p_region_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.region_access ra
        where ra.user_id = auth.uid()
          and ra.region_id = p_region_id
    );
$$;

create or replace function public.my_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select p.member_id
    from public.profiles p
    where p.id = auth.uid()
    limit 1;
$$;

create or replace function public.is_region_leader(p_region_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and (
              p.role = 'superadmin'
              or (
                  p.region_id = p_region_id
                  and p.role in ('slt')
              )
          )
    )
    or exists (
        select 1
        from public.profile_region_positions prp
        where prp.profile_id = auth.uid()
          and prp.region_id = p_region_id
          and prp.region_position in (
              'nantan',
              'weasel_shaker',
              'first_f',
              'second_f',
              'third_f'
          )
    );
$$;

create or replace function public.manages_ao(
    p_ao_id uuid,
    p_region_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.has_region_access(p_region_id)
    and exists (
        select 1
        from public.profile_ao_permissions pap
        where pap.profile_id = auth.uid()
          and pap.region_id = p_region_id
          and pap.ao_id = p_ao_id
          and pap.ao_position in (
              'aoq',
              'ao_coq',
              'first_f',
              'second_f',
              'third_f'
          )
    );
$$;

-- =========================================================
-- AOS: keep SELECT policy, restrict writes to region leaders
-- =========================================================

drop policy if exists aos_insert_accessible_regions on public.aos;
drop policy if exists aos_update_accessible_regions on public.aos;
drop policy if exists aos_delete_accessible_regions on public.aos;

create policy aos_insert_region_leader
on public.aos
for insert
to authenticated
with check (
    public.is_region_leader(region_id)
);

create policy aos_update_region_leader
on public.aos
for update
to authenticated
using (
    public.is_region_leader(region_id)
)
with check (
    public.is_region_leader(region_id)
);

create policy aos_delete_region_leader
on public.aos
for delete
to authenticated
using (
    public.is_region_leader(region_id)
);


-- =========================================================
-- Q SLOTS: keep SELECT policy, restrict create/delete
-- =========================================================

drop policy if exists q_slots_insert_accessible_regions on public.q_slots;
drop policy if exists q_slots_delete_accessible_regions on public.q_slots;

create policy q_slots_insert_leader_or_ao_manager
on public.q_slots
for insert
to authenticated
with check (
    public.is_region_leader(region_id)
    or public.manages_ao(ao_id, region_id)
);

create policy q_slots_delete_leader_or_ao_manager
on public.q_slots
for delete
to authenticated
using (
    public.is_region_leader(region_id)
    or public.manages_ao(ao_id, region_id)
);

-- =========================================================
-- Q SLOTS: restrict update access, then guard allowed changes
-- =========================================================

drop policy if exists q_slots_update_accessible_regions on public.q_slots;

create policy q_slots_update_leader_manager_or_region_member
on public.q_slots
for update
to authenticated
using (
    public.is_region_leader(region_id)
    or public.manages_ao(ao_id, region_id)
    or (
        public.has_region_access(region_id)
        and public.my_member_id() is not null
        and (
            q_user_id is null
            or q_user_id = public.my_member_id()
        )
    )
)
with check (
    public.is_region_leader(region_id)
    or public.manages_ao(ao_id, region_id)
    or (
        public.has_region_access(region_id)
        and public.my_member_id() is not null
        and (
            q_user_id is null
            or q_user_id = public.my_member_id()
        )
    )
);

-- =========================================================
-- Q SLOTS: guard normal user updates
-- =========================================================

create or replace function public.guard_q_slot_user_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Region leaders and AO managers can manage the slot.
    if public.is_region_leader(old.region_id)
       or public.manages_ao(old.ao_id, old.region_id)
    then
        return new;
    end if;

    -- Normal users cannot change slot identity/schedule fields.
    if old.region_id is distinct from new.region_id
        or old.ao_id is distinct from new.ao_id
        or old.date is distinct from new.date
        or old.created_at is distinct from new.created_at
    then
        raise exception 'Only leaders can modify Q slot identity fields.';
    end if;

    -- User must be linked to a member.
    if public.my_member_id() is null then
        raise exception 'User must be linked to a member to update Q slots.';
    end if;

    -- Cannot assign the slot to someone else.
    if new.q_user_id is not null
       and new.q_user_id is distinct from public.my_member_id()
    then
        raise exception 'Users may only claim Q slots for themselves.';
    end if;

    -- If the slot is open, the only allowed normal-user action is claiming it.
    -- No metadata edits while open or during claim.
    if old.q_user_id is null then
        if new.q_user_id is distinct from public.my_member_id() then
            raise exception 'Users may only claim open Q slots for themselves.';
        end if;

        if old.override_time is distinct from new.override_time
            or old.override_emphasis is distinct from new.override_emphasis
            or old.override_title is distinct from new.override_title
            or old.custom_emphasis_label is distinct from new.custom_emphasis_label
            or old.preblast_text is distinct from new.preblast_text
            or old.preblast_last_modified_at is distinct from new.preblast_last_modified_at
            or old.preblast_posted_at is distinct from new.preblast_posted_at
        then
            raise exception 'Users cannot edit open Q slot metadata.';
        end if;

        return new;
    end if;

    -- If the slot belongs to someone else, normal users cannot update it.
    if old.q_user_id is distinct from public.my_member_id() then
        raise exception 'Users may only update their own assigned Q slots.';
    end if;

    -- At this point:
    -- old.q_user_id = my member id
    -- new.q_user_id is either my member id or null
    -- So the assigned Q can edit metadata or unclaim.
    return new;
end;
$$;

drop trigger if exists guard_q_slot_user_update_trigger on public.q_slots;

create trigger guard_q_slot_user_update_trigger
before update on public.q_slots
for each row
execute function public.guard_q_slot_user_update();