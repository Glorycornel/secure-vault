-- RLS policy tests for group sharing (pgTAP)

begin;

create extension if not exists pgcrypto;
create extension if not exists pgtap;

create temp table test_ids (
  owner_id uuid,
  member_id uuid,
  outsider_id uuid,
  owner_email text,
  member_email text,
  outsider_email text,
  group_id uuid,
  note_id uuid
) on commit drop;

insert into test_ids values (
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid()::text || '@example.com',
  gen_random_uuid()::text || '@example.com',
  gen_random_uuid()::text || '@example.com',
  gen_random_uuid(),
  gen_random_uuid()
);

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
select owner_id, owner_email, '{}'::jsonb, '{}'::jsonb from test_ids
union all
select member_id, member_email, '{}'::jsonb, '{}'::jsonb from test_ids
union all
select outsider_id, outsider_email, '{}'::jsonb, '{}'::jsonb from test_ids
on conflict do nothing;

insert into public.profiles (user_id, email, box_public_key, enc_box_secret_key, enc_box_secret_key_iv)
select owner_id, owner_email, 'pub', 'ct', 'iv' from test_ids
union all
select member_id, member_email, 'pub', 'ct', 'iv' from test_ids
union all
select outsider_id, outsider_email, 'pub', 'ct', 'iv' from test_ids
on conflict do nothing;

insert into public.groups (id, name, owner_id)
select group_id, 'Test Group', owner_id from test_ids;

insert into public.group_members (group_id, user_id, role)
select group_id, owner_id, 'owner' from test_ids;

insert into public.encrypted_notes (id, user_id, title, ciphertext, created_at, updated_at)
select note_id, owner_id, 'Title', '{"iv":"iv","ciphertext":"ct"}', now(), now()
from test_ids;

select set_config('test.owner_id', owner_id::text, true) from test_ids;
select set_config('test.member_id', member_id::text, true) from test_ids;
select set_config('test.outsider_id', outsider_id::text, true) from test_ids;
select set_config('test.group_id', group_id::text, true) from test_ids;
select set_config('test.note_id', note_id::text, true) from test_ids;

select plan(9);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', current_setting('test.owner_id'), true);
select lives_ok(
  $$insert into public.group_members (group_id, user_id, role)
    values (
      current_setting('test.group_id')::uuid,
      current_setting('test.member_id')::uuid,
      'member'
    )$$,
  'owner can add members'
);

select set_config('request.jwt.claim.sub', current_setting('test.member_id'), true);
select throws_ok(
  $$insert into public.group_members (group_id, user_id, role)
    values (
      current_setting('test.group_id')::uuid,
      current_setting('test.outsider_id')::uuid,
      'member'
    )$$,
  42501,
  'new row violates row-level security policy for table "group_members"',
  'non-owner cannot add members'
);

select is(
  (select count(*) from public.groups where id = current_setting('test.group_id')::uuid),
  1::bigint,
  'member can read group'
);

select ok(
  (select count(*) from public.group_members
   where group_id = current_setting('test.group_id')::uuid) >= 1,
  'member can read group_members'
);

select set_config('request.jwt.claim.sub', current_setting('test.outsider_id'), true);
select is(
  (select count(*) from public.groups where id = current_setting('test.group_id')::uuid),
  0::bigint,
  'non-member cannot read group'
);

select is(
  (select count(*) from public.group_members
   where group_id = current_setting('test.group_id')::uuid),
  0::bigint,
  'non-member cannot read group_members'
);

select set_config('request.jwt.claim.sub', current_setting('test.owner_id'), true);
select lives_ok(
  $$insert into public.note_shares (
      note_id,
      shared_with_type,
      shared_with_id,
      permission,
      wrapped_note_key,
      wrapped_note_key_iv
    )
    values (
      current_setting('test.note_id')::uuid,
      'group',
      current_setting('test.group_id')::uuid,
      'read',
      'ct',
      'iv'
    )$$,
  'owner can create share'
);

select set_config('request.jwt.claim.sub', current_setting('test.member_id'), true);
select is(
  (select count(*)
   from public.note_shares
   where note_id = current_setting('test.note_id')::uuid
     and shared_with_id = current_setting('test.group_id')::uuid),
  1::bigint,
  'member can see share'
);

select set_config('request.jwt.claim.sub', current_setting('test.outsider_id'), true);
select is(
  (select count(*)
   from public.note_shares
   where note_id = current_setting('test.note_id')::uuid
     and shared_with_id = current_setting('test.group_id')::uuid),
  0::bigint,
  'non-member cannot see share'
);

select * from finish();

rollback;
