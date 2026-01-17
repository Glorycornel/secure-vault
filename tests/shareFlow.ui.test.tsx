import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import SharedNoteViewPage from "@/app/(vault)/shared/[id]/page";
import { createGroup, inviteMemberByEmail } from "@/lib/groups/groups";
import { shareNoteToGroup } from "@/lib/shares/shareService";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "note-1" }),
}));

jest.mock("@/hooks/useVault", () => ({
  useVault: () => ({ key: {} as CryptoKey, isUnlocked: true }),
}));

jest.mock("@/lib/groups/groups", () => ({
  createGroup: jest.fn().mockResolvedValue({ groupId: "group-1" }),
  inviteMemberByEmail: jest.fn().mockResolvedValue({ invitedUserId: "user-2" }),
}));

jest.mock("@/lib/shares/shareService", () => ({
  shareNoteToGroup: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/db/indexedDb", () => ({
  getSharedEncryptedNote: jest.fn().mockResolvedValue({
    id: "note-1",
    payload: { iv: "iv", ciphertext: "ct" },
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    permission: "read",
  }),
  upsertSharedEncryptedNote: jest.fn(),
}));

jest.mock("@/lib/notes/noteCrypto", () => ({
  decryptAnyNotePayload: jest.fn().mockResolvedValue({ title: "Hello", body: "Shared body" }),
  encryptNoteWithPerNoteKey: jest.fn().mockResolvedValue({
    payload: { iv: "iv", ciphertext: "ct" },
  }),
}));

jest.mock("@/lib/supabase/sharedNotes", () => ({
  updateSharedNotePayload: jest.fn().mockResolvedValue(undefined),
}));

describe("share flow UI", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it("creates group, invites member, shares note, receiver can decrypt", async () => {
    await createGroup("Team", "pubkey");
    await inviteMemberByEmail({
      groupId: "group-1",
      email: "member@example.com",
      groupKey: new Uint8Array(32),
      keyVersion: 1,
    });
    await shareNoteToGroup({
      noteId: "note-1",
      groupId: "group-1",
      permission: "read",
      groupKey: new Uint8Array(32),
      noteKey: new Uint8Array(32),
      keyVersion: 1,
    });

    expect(createGroup).toHaveBeenCalled();
    expect(inviteMemberByEmail).toHaveBeenCalled();
    expect(shareNoteToGroup).toHaveBeenCalled();

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<SharedNoteViewPage />);
    });

    const serialized = JSON.stringify(renderer!.toJSON());
    expect(serialized).toContain("Hello");
    expect(serialized).toContain("Shared body");
  });
});
