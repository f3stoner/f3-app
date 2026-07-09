alter table public.profile_ao_permissions
drop constraint if exists profile_ao_permissions_position_check;

alter table public.profile_ao_permissions
add constraint profile_ao_permissions_position_check
check (
    ao_position = any (
        array[
            'aoq'::text,
            'ao_coq'::text,
            'ao_data_q'::text,
            'first_f'::text,
            'second_f'::text,
            'third_f'::text
        ]
    )
);