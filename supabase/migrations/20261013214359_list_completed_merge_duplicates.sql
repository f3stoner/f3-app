create or replace function public.list_completed_merge_duplicates()
returns table (member_id uuid)
language sql
security definer
set search_path = ''
as $$
    select distinct mm.duplicate_member_id
    from public.member_merges mm
    where mm.status = 'completed'
      and public.can_manage_regional_member_merge(
          mm.canonical_member_id,
          mm.duplicate_member_id
      );
$$;

revoke all on function public.list_completed_merge_duplicates() from public;
grant execute on function public.list_completed_merge_duplicates() to authenticated;