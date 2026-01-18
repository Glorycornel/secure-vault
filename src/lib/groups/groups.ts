import { getSupabaseClient } from "@/lib/supabaseClient";
import { encryptBytes } from "@/lib/crypto/aesBytes";
import { importAesKey } from "@/lib/crypto/aesRaw";
import { sealTo, b64ToU8, u8ToB64 } from "@/lib/crypto/box";

function random32(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function createGroup(name: string, ownerBoxPublicKeyB64: string) {
  const supabase = getSupabaseClient();
  const { data: u } = await supabase.auth.getUser();
  const ownerId = u.user?.id;
  if (!ownerId) throw new Error("Not authenticated");

  // 1) create group
  const { data: group, error: gErr } = await supabase
    .from("groups")
    .insert({ name, owner_id: ownerId })
    .select("id")
    .single();
  if (gErr) throw gErr;

  const groupId = group.id as string;

  // 2) add owner membership
  const { error: mErr } = await supabase
    .from("group_members")
    .insert({ group_id: groupId, user_id: ownerId, role: "owner" });
  if (mErr) throw mErr;

  // 3) generate groupKey
  const groupKey = random32();

  // 4) seal groupKey to owner
  const ownerPub = b64ToU8(ownerBoxPublicKeyB64);
  const sealed = await sealTo(ownerPub, groupKey);

  const { error: kErr } = await supabase.from("group_keys").insert({
    group_id: groupId,
    user_id: ownerId,
    sealed_group_key: u8ToB64(sealed),
    key_version: 1,
  });
  if (kErr) throw kErr;

  return { groupId };
}

export type GroupSummary = {
  id: string;
  name: string;
  owner_id: string;
};

export async function listMyGroups(): Promise<GroupSummary[]> {
  const supabase = getSupabaseClient();

  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr) throw uErr;
  const userId = u.user?.id;
  if (!userId) return []; // not signed in yet

  const { data, error } = await supabase
    .from("group_members")
    .select("groups!group_members_group_fk ( id, name, owner_id )")
    .eq("user_id", userId);

  if (error) {
    const details = error.details ? ` ${error.details}` : "";
    throw new Error(`[listMyGroups] ${error.message}${details}`);
  }

  type GroupMemberRow = { groups: GroupSummary | GroupSummary[] | null };
  const groups = ((data ?? []) as GroupMemberRow[])
    .flatMap((row) => (Array.isArray(row.groups) ? row.groups : [row.groups]))
    .filter((group): group is GroupSummary => Boolean(group));

  // optional sort
  groups.sort((a, b) => a.name.localeCompare(b.name));

  return groups as GroupSummary[];
}


export async function fetchGroupMembers(groupId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("group_members")
    .select("user_id,role")
    .eq("group_id", groupId)
    .order("role", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<{ user_id: string; role: string }>;
}

export async function fetchGroupMemberKeys(groupId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_group_member_keys", {
    _group_id: groupId,
  });
  if (error) throw error;
  return (data ?? []) as Array<{ user_id: string; box_public_key: string }>;
}

export async function fetchGroupNoteShares(groupId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_group_note_shares", {
    _group_id: groupId,
  });
  if (error) throw error;
  return (data ?? []) as Array<{
    note_id: string;
    shared_with_type: string;
    shared_with_id: string;
    permission: string;
    wrapped_note_key: string;
    wrapped_note_key_iv: string;
    key_version: number;
  }>;
}

export async function fetchGroupNamesByIds(ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("groups").select("id,name").in("id", ids);
  if (error) throw error;
  const out = new Map<string, string>();
  for (const row of data ?? []) {
    out.set(row.id as string, row.name as string);
  }
  return out;
}

export async function inviteMemberByEmail(params: {
  groupId: string;
  email: string;
  groupKey: Uint8Array; // decrypted locally by inviter
  keyVersion?: number;
}) {
  const supabase = getSupabaseClient();

  // lookup user by email via security-definer RPC
  const { data: prof, error: pErr } = await supabase.rpc("lookup_profile_for_invite", {
    _group_id: params.groupId,
    _email: params.email,
  });
  if (pErr) throw pErr;
  if (!prof || prof.length === 0) {
    throw new Error("No profile found for invite");
  }

  const target = Array.isArray(prof) ? prof[0] : prof;

  // add membership
  const { error: mErr } = await supabase.from("group_members").insert({
    group_id: params.groupId,
    user_id: target.user_id,
    role: "member",
  });
  if (mErr) throw mErr;

  // seal groupKey for new member
  const memberPub = b64ToU8(target.box_public_key);
  const sealed = await sealTo(memberPub, params.groupKey);

  const { error: kErr } = await supabase.from("group_keys").insert({
    group_id: params.groupId,
    user_id: target.user_id,
    sealed_group_key: u8ToB64(sealed),
    key_version: params.keyVersion ?? 1,
  });
  if (kErr) throw kErr;

  return { invitedUserId: target.user_id as string };
}

export async function removeGroupMember(params: {
  groupId: string;
  memberUserId: string;
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("remove_group_member", {
    _group_id: params.groupId,
    _member_user_id: params.memberUserId,
  });
  if (error) throw error;
}

export async function leaveGroup(groupId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("leave_group", { _group_id: groupId });
  if (error) throw error;
}

export async function deleteGroup(groupId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("delete_group", { _group_id: groupId });
  if (error) throw error;
}

export async function rotateGroupKeys(params: {
  groupId: string;
  newKeyVersion: number;
  sealedGroupKeys: Array<{ userId: string; sealedGroupKey: string }>;
  rewrappedShares: Array<{
    noteId: string;
    sharedWithType: "group" | "user";
    sharedWithId: string;
    wrappedNoteKey: string;
    wrappedNoteKeyIv: string;
  }>;
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("rotate_group_keys", {
    _group_id: params.groupId,
    _new_key_version: params.newKeyVersion,
    _sealed_group_keys: params.sealedGroupKeys.map((entry) => ({
      user_id: entry.userId,
      sealed_group_key: entry.sealedGroupKey,
    })),
    _rewrapped_shares: params.rewrappedShares.map((entry) => ({
      note_id: entry.noteId,
      shared_with_type: entry.sharedWithType,
      shared_with_id: entry.sharedWithId,
      wrapped_note_key: entry.wrappedNoteKey,
      wrapped_note_key_iv: entry.wrappedNoteKeyIv,
    })),
  });
  if (error) throw error;
}

export async function rotateGroupKeysWithPayload(params: {
  groupId: string;
  newKeyVersion: number;
  newGroupKey: Uint8Array;
  members: Array<{ userId: string; boxPublicKeyB64: string }>;
  noteShares: Array<{
    noteId: string;
    noteKey: Uint8Array;
    sharedWithType?: "group" | "user";
    sharedWithId?: string;
  }>;
}) {
  const groupAes = await importAesKey(params.newGroupKey);

  const sealedGroupKeys = await Promise.all(
    params.members.map(async (member) => ({
      userId: member.userId,
      sealedGroupKey: u8ToB64(
        await sealTo(b64ToU8(member.boxPublicKeyB64), params.newGroupKey)
      ),
    }))
  );

  const rewrappedShares = await Promise.all(
    params.noteShares.map(async (note) => {
      const wrapped = await encryptBytes(groupAes, note.noteKey);
      return {
        noteId: note.noteId,
        sharedWithType: note.sharedWithType ?? "group",
        sharedWithId: note.sharedWithId ?? params.groupId,
        wrappedNoteKey: wrapped.ciphertext,
        wrappedNoteKeyIv: wrapped.iv,
      };
    })
  );

  return rotateGroupKeys({
    groupId: params.groupId,
    newKeyVersion: params.newKeyVersion,
    sealedGroupKeys,
    rewrappedShares,
  });
}
