-- Delete a group and its related shares with a single owner-only RPC.

create or replace function public.delete_group(_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_group_owner(_group_id) then
    raise exception 'not group owner';
  end if;

  delete from public.note_shares
  where shared_with_type = 'group'
    and shared_with_id = _group_id;

  delete from public.groups where id = _group_id;
end;
$$;

grant execute on function public.delete_group(uuid) to authenticated;
