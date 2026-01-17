-- Fix recursive RLS on group_members by using a security-definer helper.

create or replace function public.is_group_owner(_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = _group_id and g.owner_id = auth.uid()
  );
$$;

drop policy if exists group_members_select_self_or_owner on public.group_members;
create policy group_members_select_self_or_owner
  on public.group_members
  for select
  using (
    user_id = auth.uid()
    or public.is_group_owner(group_members.group_id)
  );

drop policy if exists group_members_insert_owner on public.group_members;
create policy group_members_insert_owner
  on public.group_members
  for insert
  with check (
    public.is_group_owner(group_members.group_id)
  );

drop policy if exists group_members_delete_owner on public.group_members;
create policy group_members_delete_owner
  on public.group_members
  for delete
  using (
    public.is_group_owner(group_members.group_id)
  );
