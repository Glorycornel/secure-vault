# Supabase Security & Sharing

This folder documents the database policies and RPCs required for SecureVault sharing.
Apply the SQL migrations in `supabase/migrations/` to your Supabase project.

## RLS Summary

- `groups`: readable by members; only owners can insert/update/delete.
- `group_members`: readable by self or group owner; only owners can add/remove members.
- `group_keys`: only readable by the row owner; only group owners can insert/update/delete.
- `note_shares`: only note owners can create/update/delete; group members can read their group shares.
- `profiles`: only the owner can read/update/insert their profile row.

## Constraints & Indexes

- Unique:
  - `group_members (group_id, user_id)`
  - `note_shares (note_id, shared_with_type, shared_with_id)`
  - `group_keys (group_id, user_id, key_version)`
- Foreign keys with cascade:
  - `group_members.group_id -> groups.id`
  - `group_members.user_id -> auth.users.id`
  - `group_keys.group_id -> groups.id`
  - `group_keys.user_id -> auth.users.id`
  - `note_shares.note_id -> encrypted_notes.id`
- Indexes:
  - `group_members (group_id)`, `(user_id)`
  - `group_keys (group_id)`, `(user_id)`
  - `note_shares (note_id)`, `(shared_with_id)`

## Invite by Email (Safe Lookup)

Use the security-definer RPC:

- `lookup_profile_for_invite(group_id, email)`

This checks that the caller is the group owner before returning `user_id` and `box_public_key`,
avoiding open-ended email enumeration.

## Key Rotation & Revocation

Use the RPC:

- `rotate_group_keys(group_id, new_key_version, sealed_group_keys, rewrapped_shares)`
  Supporting RPCs:
- `get_group_member_keys(group_id)` (owner-only)
- `list_group_note_shares(group_id)` (owner-only)

Notes:

- `sealed_group_keys` is a JSON array of `{ user_id, sealed_group_key }`.
- `rewrapped_shares` is a JSON array of `{ note_id, shared_with_type, shared_with_id, wrapped_note_key, wrapped_note_key_iv }`.
- After rotation, old group keys are removed and `note_shares.key_version` is updated.

### Client Payload Example

Build the RPC payload after you generate a new group key and rewrap note keys.
This stays client-side; only sealed/rewrapped blobs are sent.

```ts
import { encryptBytes } from "@/lib/crypto/aesBytes";
import { importAesKey } from "@/lib/crypto/aesRaw";
import { sealTo, u8ToB64 } from "@/lib/crypto/box";
import { rotateGroupKeys } from "@/lib/groups/groups";

const groupAes = await importAesKey(newGroupKeyBytes);

const sealedGroupKeys = members.map((m) => ({
  userId: m.userId,
  sealedGroupKey: u8ToB64(await sealTo(m.boxPublicKey, newGroupKeyBytes)),
}));

const rewrappedShares = notes.map(async (note) => {
  const wrapped = await encryptBytes(groupAes, note.noteKeyBytes);
  return {
    noteId: note.noteId,
    sharedWithType: "group",
    sharedWithId: groupId,
    wrappedNoteKey: wrapped.ciphertext,
    wrappedNoteKeyIv: wrapped.iv,
  };
});

await rotateGroupKeys({
  groupId,
  newKeyVersion,
  sealedGroupKeys,
  rewrappedShares: await Promise.all(rewrappedShares),
});
```

## Share Removal / Leave Group

- Remove share: `remove_note_share(note_id, shared_with_type, shared_with_id)`
- Leave group: `leave_group(group_id)` (owners cannot leave their own group)

## Shared Note Updates (Write Permission)

To allow group members with `write` permission to update a note:

- `update_shared_note_payload(note_id, title, ciphertext)`

## Optional Audit Log

`share_audit` tracks share/unshare events via RPCs.
Access is restricted to note owners.

## Test Run

Run policy tests locally with the Supabase CLI:

```
supabase db test
```
