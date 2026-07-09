create or replace function public.can_manage_ao_q_slots(
    p_ao_id uuid,
    p_region_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_region_leader(p_region_id)
        or (
            public.has_region_access(p_region_id)
            and exists (
                select 1
                from public.profile_ao_permissions pap
                where pap.profile_id = auth.uid()
                  and pap.region_id = p_region_id
                  and pap.ao_id = p_ao_id
                  and pap.ao_position in (
                      'aoq',
                      'ao_coq',
                      'ao_data_q'
                  )
            )
        );
$$;

drop policy if exists q_slots_insert_leader_or_ao_manager on public.q_slots;

create policy q_slots_insert_leader_or_ao_manager
on public.q_slots
for insert
to authenticated
with check (
    public.can_manage_ao_q_slots(ao_id, region_id)
);

drop policy if exists q_slots_delete_leader_or_ao_manager on public.q_slots;

create policy q_slots_delete_leader_or_ao_manager
on public.q_slots
for delete
to authenticated
using (
    public.can_manage_ao_q_slots(ao_id, region_id)
);

drop policy if exists q_slots_update_leader_manager_or_region_member on public.q_slots;

create policy q_slots_update_leader_manager_or_region_member
on public.q_slots
for update
to authenticated
using (
    public.can_manage_ao_q_slots(ao_id, region_id)
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
    public.can_manage_ao_q_slots(ao_id, region_id)
    or (
        public.has_region_access(region_id)
        and public.my_member_id() is not null
        and (
            q_user_id is null
            or q_user_id = public.my_member_id()
        )
    )
);

create or replace function public.guard_q_slot_user_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Region leaders and AO Q-slot managers can manage the slot.
    if public.can_manage_ao_q_slots(old.ao_id, old.region_id)
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

    -- Assigned Q can edit metadata or unclaim.
    return new;
end;
$$;

drop trigger if exists guard_q_slot_user_update_trigger on public.q_slots;

create trigger guard_q_slot_user_update_trigger
before update on public.q_slots
for each row
execute function public.guard_q_slot_user_update();