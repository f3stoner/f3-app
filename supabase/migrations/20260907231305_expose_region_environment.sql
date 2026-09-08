begin;

drop function public.load_public_regions();

create function public.load_public_regions()
returns table (
    id uuid,
    name text,
    environment text
)
language sql
stable
security definer
set search_path = ''
as $function$
    select
        r.id,
        r.name,
        r.environment
    from public.regions r
    order by r.name;
$function$;

revoke all
on function public.load_public_regions()
from public;

grant execute
on function public.load_public_regions()
to authenticated;

commit;