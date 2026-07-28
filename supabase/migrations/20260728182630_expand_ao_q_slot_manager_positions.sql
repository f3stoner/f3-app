begin;

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
                      'ao_data_q',
                      'first_f',
                      'second_f',
                      'third_f'
                  )
            )
        );
$$;

commit;