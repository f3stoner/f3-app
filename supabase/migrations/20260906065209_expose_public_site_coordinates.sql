do $$
declare
    v_definition text;
begin
    select pg_get_functiondef(
        'public.load_public_region_site(text,date,date)'::regprocedure
    )
    into v_definition;

    if v_definition is null then
        raise exception
            'load_public_region_site(text,date,date) was not found';
    end if;

    /*
     * AO default site.
     */
    v_definition := replace(
        v_definition,
        '''name'', s.name,
                                ''address'', s.address,
                                ''mapUrl'', s.map_url',
        '''name'', s.name,
                                ''address'', s.address,
                                ''mapUrl'', s.map_url,
                                ''lat'', s.lat,
                                ''lng'', s.lng'
    );

    /*
     * Recurring schedule site.
     */
    v_definition := replace(
        v_definition,
        '''name'', schedule_site.name,
                                                ''address'', schedule_site.address,
                                                ''mapUrl'', schedule_site.map_url',
        '''name'', schedule_site.name,
                                                ''address'', schedule_site.address,
                                                ''mapUrl'', schedule_site.map_url,
                                                ''lat'', schedule_site.lat,
                                                ''lng'', schedule_site.lng'
    );

    /*
     * Effective site on persisted calendar occurrences.
     */
    v_definition := replace(
        v_definition,
        '''name'', effective_site.name,
                                    ''address'', effective_site.address,
                                    ''mapUrl'', effective_site.map_url',
        '''name'', effective_site.name,
                                    ''address'', effective_site.address,
                                    ''mapUrl'', effective_site.map_url,
                                    ''lat'', effective_site.lat,
                                    ''lng'', effective_site.lng'
    );

    execute v_definition;
end
$$;

revoke all on function public.load_public_region_site(
    text,
    date,
    date
) from public;

grant execute on function public.load_public_region_site(
    text,
    date,
    date
) to anon, authenticated;