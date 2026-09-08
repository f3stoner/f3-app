begin;

create or replace function public.is_supported_region_public_site_media_slot(
    p_slot_key text
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
    select btrim(p_slot_key) in (
        'home_community_primary',
        'home_community_secondary',
        'new_here_workout',
        'new_here_coffeeteria',
        'about_fitness',
        'about_fellowship',
        'about_faith'
    );
$function$;

revoke all
on function public.is_supported_region_public_site_media_slot(text)
from public, anon, authenticated;

commit;