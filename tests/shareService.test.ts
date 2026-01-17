import { shareNoteToGroup, shareNoteToUser } from "@/lib/shares/shareService";

jest.mock("@/lib/crypto/aesBytes", () => ({
  encryptBytes: jest.fn().mockResolvedValue({ ciphertext: "wrapped-ct", iv: "wrapped-iv" }),
}));

const rpcMock = jest.fn().mockResolvedValue({ error: null });
const upsertMock = jest.fn().mockResolvedValue({ error: null });
jest.mock("@/lib/supabaseClient", () => ({
  getSupabaseClient: () => ({
    rpc: rpcMock,
    from: () => ({
      upsert: upsertMock,
    }),
  }),
}));

jest.mock("@/lib/crypto/aesRaw", () => ({
  importAesKey: jest.fn().mockResolvedValue({} as CryptoKey),
}));

jest.mock("@/lib/crypto/box", () => ({
  sealTo: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  u8ToB64: jest.fn().mockReturnValue("sealed-b64"),
}));

describe("shareNoteToGroup", () => {
  it("wraps note key and calls share RPC with expected payload", async () => {
    const groupKey = crypto.getRandomValues(new Uint8Array(32));
    const noteKey = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = { ciphertext: "wrapped-ct", iv: "wrapped-iv" };

    await shareNoteToGroup({
      noteId: "note-1",
      groupId: "group-1",
      permission: "read",
      groupKey,
      noteKey,
      keyVersion: 2,
    });

    expect(rpcMock).toHaveBeenCalledWith("share_note_to_group", {
      _note_id: "note-1",
      _group_id: "group-1",
      _permission: "read",
      _wrapped_note_key: wrapped.ciphertext,
      _wrapped_note_key_iv: wrapped.iv,
      _key_version: 2,
    });
  });
});

describe("shareNoteToUser", () => {
  it("seals note key to recipient and upserts note_shares", async () => {
    const noteKey = crypto.getRandomValues(new Uint8Array(32));
    const recipientKey = crypto.getRandomValues(new Uint8Array(32));

    await shareNoteToUser({
      noteId: "note-2",
      userId: "user-2",
      permission: "write",
      recipientBoxPublicKey: recipientKey,
      noteKey,
    });

    const { sealTo, u8ToB64 } = jest.requireMock("@/lib/crypto/box");
    expect(sealTo).toHaveBeenCalledWith(recipientKey, noteKey);
    expect(u8ToB64).toHaveBeenCalled();
    expect(upsertMock).toHaveBeenCalledWith(
      {
        note_id: "note-2",
        shared_with_type: "user",
        shared_with_id: "user-2",
        permission: "write",
        wrapped_note_key: "sealed-b64",
        wrapped_note_key_iv: "",
        key_version: 1,
      },
      { onConflict: "note_id,shared_with_type,shared_with_id" }
    );
  });
});
