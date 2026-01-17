-- RLS policies, constraints, and functions for groups/sharing

-- -----------------------------
-- Schema adjustments
-- -----------------------------
create extension if not exists pgcrypto;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

create table if not exists public.group_keys (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sealed_group_key text not null,
  key_version integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.encrypted_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  ciphertext text not null,
  note_key_ciphertext text,
  note_key_iv text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_encrypted_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists encrypted_notes_set_updated_at on public.encrypted_notes;
create trigger encrypted_notes_set_updated_at
before update on public.encrypted_notes
for each row execute function public.set_encrypted_notes_updated_at();

create table if not exists public.note_shares (
  note_id uuid not null references public.encrypted_notes(id) on delete cascade,
  shared_with_type text not null,
  shared_with_id uuid not null,
  permission text not null default 'read',
  wrapped_note_key text not null,
  wrapped_note_key_iv text not null,
  key_version integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  box_public_key text,
  enc_box_secret_key text,
  enc_box_secret_key_iv text,
  created_at timestamptz not null default now()
);

alter table if exists public.profiles
  add column if not exists user_id uuid,
  add column if not exists email text,
  add column if not exists display_name text,
  add column if not exists box_public_key text,
  add column if not exists enc_box_secret_key text,
  add column if not exists enc_box_secret_key_iv text;

alter table if exists public.profiles
  add column if not exists email_normalized text;

update public.profiles
set email_normalized = lower(trim(email))
where email is not null and email_normalized is null;

create unique index if not exists profiles_email_normalized_unique
  on public.profiles (email_normalized);

create or replace function public.set_email_normalized()
returns trigger
language plpgsql
as $$
begin
  if new.email is not null then
    new.email_normalized := lower(trim(new.email));
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_email_normalized on public.profiles;
create trigger profiles_set_email_normalized
before insert or update of email on public.profiles
for each row execute function public.set_email_normalized();

alter table if exists public.note_shares
  add column if not exists key_version integer not null default 1;

-- -----------------------------
-- Constraints and indexes
-- -----------------------------
do $$
begin
  alter table public.group_members
    add constraint group_members_unique unique (group_id, user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.group_keys
    add constraint group_keys_unique unique (group_id, user_id, key_version);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.note_shares
    add constraint note_shares_unique unique (note_id, shared_with_type, shared_with_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.group_members
    add constraint group_members_group_fk
    foreign key (group_id) references public.groups(id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.group_members
    add constraint group_members_user_fk
    foreign key (user_id) references auth.users(id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.group_keys
    add constraint group_keys_group_fk
    foreign key (group_id) references public.groups(id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.group_keys
    add constraint group_keys_user_fk
    foreign key (user_id) references auth.users(id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.note_shares
    add constraint note_shares_note_fk
    foreign key (note_id) references public.encrypted_notes(id) on delete cascade;
exception when duplicate_object then null;
end $$;

create index if not exists group_members_group_id_idx
  on public.group_members (group_id);

create index if not exists group_members_user_id_idx
  on public.group_members (user_id);

create index if not exists group_keys_group_id_idx
  on public.group_keys (group_id);

create index if not exists group_keys_user_id_idx
  on public.group_keys (user_id);

create index if not exists note_shares_shared_with_id_idx
  on public.note_shares (shared_with_id);

create index if not exists note_shares_note_id_idx
  on public.note_shares (note_id);

create index if not exists note_shares_group_id_idx
  on public.note_shares (shared_with_id)
  where shared_with_type = 'group';

-- -----------------------------
-- Audit logging (optional)
-- -----------------------------
create table if not exists public.share_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  note_id uuid not null references public.encrypted_notes(id) on delete cascade,
  action text not null,
  shared_with_type text not null,
  shared_with_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.share_audit enable row level security;

drop policy if exists share_audit_select_owner on public.share_audit;
create policy share_audit_select_owner
  on public.share_audit
  for select
  using (
    exists (
      select 1
      from public.encrypted_notes n
      where n.id = share_audit.note_id and n.user_id = auth.uid()
    )
  );

-- -----------------------------
-- RLS policies
-- -----------------------------
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

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_keys enable row level security;
alter table public.note_shares enable row level security;
alter table public.profiles enable row level security;

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
    public.is_group_owner(group_keys.group_id)
  );

drop policy if exists group_keys_update_owner on public.group_keys;
create policy group_keys_update_owner
  on public.group_keys
  for update
  using (
    public.is_group_owner(group_keys.group_id)
  )
  with check (
    public.is_group_owner(group_keys.group_id)
  );

drop policy if exists group_keys_delete_owner on public.group_keys;
create policy group_keys_delete_owner
  on public.group_keys
  for delete
  using (
    public.is_group_owner(group_keys.group_id)
  );

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
  );

drop policy if exists note_shares_insert_owner on public.note_shares;
create policy note_shares_insert_owner
  on public.note_shares
  for insert
  with check (
    exists (
      select 1 from public.encrypted_notes n
      where n.id = note_shares.note_id and n.user_id = auth.uid()
    )
  );

drop policy if exists note_shares_update_owner on public.note_shares;
create policy note_shares_update_owner
  on public.note_shares
  for update
  using (
    exists (
      select 1 from public.encrypted_notes n
      where n.id = note_shares.note_id and n.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.encrypted_notes n
      where n.id = note_shares.note_id and n.user_id = auth.uid()
    )
  );

drop policy if exists note_shares_delete_owner on public.note_shares;
create policy note_shares_delete_owner
  on public.note_shares
  for delete
  using (
    exists (
      select 1 from public.encrypted_notes n
      where n.id = note_shares.note_id and n.user_id = auth.uid()
    )
  );

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
  on public.profiles
  for select
  using (user_id = auth.uid());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles
  for insert
  with check (user_id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------
-- RPC helpers
-- -----------------------------
create or replace function public.lookup_profile_for_invite(
  _group_id uuid,
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

  if not exists (
    select 1 from public.groups g
    where g.id = _group_id and g.owner_id = auth.uid()
  ) then
    raise exception 'not group owner';
  end if;

  return query
  select p.user_id, p.box_public_key
  from public.profiles p
  where p.email_normalized = lower(trim(_email));
end;
$$;

create or replace function public.share_note_to_group(
  _note_id uuid,
  _group_id uuid,
  _permission text,
  _wrapped_note_key text,
  _wrapped_note_key_iv text,
  _key_version integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.encrypted_notes n
    where n.id = _note_id and n.user_id = auth.uid()
  ) then
    raise exception 'not note owner';
  end if;

  insert into public.note_shares (
    note_id,
    shared_with_type,
    shared_with_id,
    permission,
    wrapped_note_key,
    wrapped_note_key_iv,
    key_version
  )
  values (
    _note_id,
    'group',
    _group_id,
    _permission,
    _wrapped_note_key,
    _wrapped_note_key_iv,
    _key_version
  )
  on conflict (note_id, shared_with_type, shared_with_id)
  do update set
    permission = excluded.permission,
    wrapped_note_key = excluded.wrapped_note_key,
    wrapped_note_key_iv = excluded.wrapped_note_key_iv,
    key_version = excluded.key_version;

  insert into public.share_audit (
    actor_id,
    note_id,
    action,
    shared_with_type,
    shared_with_id
  )
  values (auth.uid(), _note_id, 'share', 'group', _group_id);
end;
$$;

create or replace function public.remove_note_share(
  _note_id uuid,
  _shared_with_type text,
  _shared_with_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.encrypted_notes n
    where n.id = _note_id and n.user_id = auth.uid()
  ) then
    raise exception 'not note owner';
  end if;

  delete from public.note_shares
  where note_id = _note_id
    and shared_with_type = _shared_with_type
    and shared_with_id = _shared_with_id;

  insert into public.share_audit (
    actor_id,
    note_id,
    action,
    shared_with_type,
    shared_with_id
  )
  values (auth.uid(), _note_id, 'unshare', _shared_with_type, _shared_with_id);
end;
$$;

create or replace function public.leave_group(_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if exists (
    select 1 from public.groups g
    where g.id = _group_id and g.owner_id = auth.uid()
  ) then
    raise exception 'owner cannot leave group';
  end if;

  delete from public.group_members
  where group_id = _group_id and user_id = auth.uid();

  delete from public.group_keys
  where group_id = _group_id and user_id = auth.uid();
end;
$$;

create or replace function public.remove_group_member(
  _group_id uuid,
  _member_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.groups g
    where g.id = _group_id and g.owner_id = auth.uid()
  ) then
    raise exception 'not group owner';
  end if;

  delete from public.group_members
  where group_id = _group_id and user_id = _member_user_id;

  delete from public.group_keys
  where group_id = _group_id and user_id = _member_user_id;
end;
$$;

create or replace function public.rotate_group_keys(
  _group_id uuid,
  _new_key_version integer,
  _sealed_group_keys jsonb,
  _rewrapped_shares jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member jsonb;
  share jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.groups g
    where g.id = _group_id and g.owner_id = auth.uid()
  ) then
    raise exception 'not group owner';
  end if;

  if _new_key_version is null or _new_key_version < 1 then
    raise exception 'invalid key version';
  end if;

  for member in select * from jsonb_array_elements(_sealed_group_keys)
  loop
    insert into public.group_keys (
      group_id,
      user_id,
      sealed_group_key,
      key_version
    )
    values (
      _group_id,
      (member->>'user_id')::uuid,
      member->>'sealed_group_key',
      _new_key_version
    )
    on conflict (group_id, user_id, key_version)
    do update set sealed_group_key = excluded.sealed_group_key;
  end loop;

  for share in select * from jsonb_array_elements(_rewrapped_shares)
  loop
    update public.note_shares
    set wrapped_note_key = share->>'wrapped_note_key',
        wrapped_note_key_iv = share->>'wrapped_note_key_iv',
        key_version = _new_key_version
    where note_id = (share->>'note_id')::uuid
      and shared_with_type = share->>'shared_with_type'
      and shared_with_id = (share->>'shared_with_id')::uuid;
  end loop;

  delete from public.group_keys
  where group_id = _group_id and key_version < _new_key_version;
end;
$$;

create or replace function public.update_shared_note_payload(
  _note_id uuid,
  _title text,
  _ciphertext text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.note_shares s
    join public.group_members gm
      on gm.group_id = s.shared_with_id
    where s.note_id = _note_id
      and s.shared_with_type = 'group'
      and s.permission = 'write'
      and gm.user_id = auth.uid()
  ) then
    raise exception 'no write permission';
  end if;

  update public.encrypted_notes
  set title = _title,
      ciphertext = _ciphertext,
      updated_at = now()
  where id = _note_id;
end;
$$;

create or replace function public.get_group_member_keys(_group_id uuid)
returns table(user_id uuid, box_public_key text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.groups g
    where g.id = _group_id and g.owner_id = auth.uid()
  ) then
    raise exception 'not group owner';
  end if;

  return query
  select p.user_id, p.box_public_key
  from public.group_members gm
  join public.profiles p on p.user_id = gm.user_id
  where gm.group_id = _group_id;
end;
$$;

create or replace function public.list_group_note_shares(_group_id uuid)
returns table(
  note_id uuid,
  shared_with_type text,
  shared_with_id uuid,
  permission text,
  wrapped_note_key text,
  wrapped_note_key_iv text,
  key_version integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.groups g
    where g.id = _group_id and g.owner_id = auth.uid()
  ) then
    raise exception 'not group owner';
  end if;

  return query
  select s.note_id,
         s.shared_with_type,
         s.shared_with_id,
         s.permission,
         s.wrapped_note_key,
         s.wrapped_note_key_iv,
         s.key_version
  from public.note_shares s
  where s.shared_with_type = 'group'
    and s.shared_with_id = _group_id;
end;
$$;
