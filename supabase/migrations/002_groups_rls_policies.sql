-- Ensure RLS policies for groups and related tables are present.

alter table if exists public.groups enable row level security;
alter table if exists public.group_members enable row level security;
alter table if exists public.group_keys enable row level security;

grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.group_keys to authenticated;

drop policy if exists groups_select_member on public.groups;
create policy groups_select_member
  on public.groups
  for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid()
    )
  );

drop policy if exists groups_insert_owner on public.groups;
create policy groups_insert_owner
  on public.groups
  for insert
  with check (owner_id = auth.uid());

drop policy if exists groups_update_owner on public.groups;
create policy groups_update_owner
  on public.groups
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists groups_delete_owner on public.groups;
create policy groups_delete_owner
  on public.groups
  for delete
  using (owner_id = auth.uid());

drop policy if exists group_members_select_self_or_owner on public.group_members;
create policy group_members_select_self_or_owner
  on public.group_members
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id and g.owner_id = auth.uid()
    )
  );

drop policy if exists group_members_insert_owner on public.group_members;
create policy group_members_insert_owner
  on public.group_members
  for insert
  with check (
    exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id and g.owner_id = auth.uid()
    )
  );

drop policy if exists group_members_delete_owner on public.group_members;
create policy group_members_delete_owner
  on public.group_members
  for delete
  using (
    exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id and g.owner_id = auth.uid()
    )
  );

drop policy if exists group_keys_select_self on public.group_keys;
create policy group_keys_select_self
  on public.group_keys
  for select
  using (user_id = auth.uid());

drop policy if exists group_keys_insert_owner on public.group_keys;
create policy group_keys_insert_owner
  on public.group_keys
  for insert
  with check (
    exists (
      select 1
      from public.groups g
      where g.id = group_keys.group_id and g.owner_id = auth.uid()
    )
  );

drop policy if exists group_keys_update_owner on public.group_keys;
create policy group_keys_update_owner
  on public.group_keys
  for update
  using (
    exists (
      select 1
      from public.groups g
      where g.id = group_keys.group_id and g.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.groups g
      where g.id = group_keys.group_id and g.owner_id = auth.uid()
    )
  );

drop policy if exists group_keys_delete_owner on public.group_keys;
create policy group_keys_delete_owner
  on public.group_keys
  for delete
  using (
    exists (
      select 1
      from public.groups g
      where g.id = group_keys.group_id and g.owner_id = auth.uid()
    )
  );
