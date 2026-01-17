-- Allow recipients to see user shares and add email lookup RPC for user sharing.

drop policy if exists note_shares_select_member on public.note_shares;
create policy note_shares_select_member
  on public.note_shares
  for select
  using (
    exists (
      select 1 from public.encrypted_notes n
      where n.id = note_shares.note_id and n.user_id = auth.uid()
    )
    or (
      note_shares.shared_with_type = 'group'
      and exists (
        select 1
        from public.group_members gm
        where gm.group_id = note_shares.shared_with_id
          and gm.user_id = auth.uid()
      )
    )
    or (
      note_shares.shared_with_type = 'user'
      and note_shares.shared_with_id = auth.uid()
    )
  );

create or replace function public.lookup_profile_by_email(
  _email text
)
returns table(user_id uuid, box_public_key text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return query
  select p.user_id, p.box_public_key
  from public.profiles p
  where p.email_normalized = lower(trim(_email));
end;
$$;
