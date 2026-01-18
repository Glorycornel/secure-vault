import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import VaultPage from "@/app/(vault)/vault/page";
import { deleteGroup, listMyGroups } from "@/lib/groups/groups";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    priority: _priority,
    alt,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    priority?: boolean;
  }) => <img alt={alt ?? ""} {...props} />,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock("@/hooks/useVault", () => ({
  useVault: () => ({
    key: {} as CryptoKey,
    isUnlocked: true,
    unlock: jest.fn(),
    lock: jest.fn(),
  }),
}));

jest.mock("@/hooks/useIdleLock", () => ({
  useIdleLock: jest.fn(),
}));

jest.mock("@/components/vault/PasswordGenerator", () => ({
  __esModule: true,
  default: () => <div>password generator</div>,
}));

jest.mock("@/lib/supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
  }),
}));

jest.mock("@/lib/supabase/vaultKdf", () => ({
  fetchVaultSaltB64: jest.fn().mockResolvedValue("salt"),
}));

jest.mock("@/lib/db/indexedDb", () => ({
  deleteEncryptedNote: jest.fn(),
  getMeta: jest.fn().mockResolvedValue(null),
  setMeta: jest.fn(),
  listEncryptedNotes: jest.fn().mockResolvedValue([]),
  upsertEncryptedNote: jest.fn(),
  upsertEncryptedNoteKey: jest.fn(),
}));

jest.mock("@/lib/sync/syncDown", () => ({
  syncDownFromCloud: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/sync/syncSharedDown", () => ({
  syncDownSharedNotes: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/supabase/notesSync", () => ({
  upsertRemoteEncryptedNote: jest.fn(),
  deleteRemoteEncryptedNote: jest.fn(),
  fetchRemoteEncryptedNoteKey: jest.fn(),
  fetchRemoteEncryptedNote: jest.fn(),
}));

jest.mock("@/lib/notes/noteCrypto", () => ({
  decryptAnyNotePayload: jest.fn(),
  encryptNoteWithPerNoteKey: jest.fn(),
  loadNoteKeyBytes: jest.fn(),
}));

jest.mock("@/lib/groups/groupKeyLoader", () => ({
  loadMyGroupKeys: jest.fn().mockResolvedValue(new Map()),
}));

jest.mock("@/lib/supabase/profiles", () => ({
  lookupProfileByEmail: jest.fn(),
}));

jest.mock("@/lib/supabase/profileKeys", () => ({
  ensureProfileKeys: jest.fn().mockResolvedValue({ boxPublicKeyB64: "pub" }),
  loadMyBoxKeypair: jest
    .fn()
    .mockResolvedValue({ publicKey: new Uint8Array(32), privateKey: new Uint8Array(32) }),
}));

jest.mock("@/lib/logger", () => ({
  devWarn: jest.fn(),
  devError: jest.fn(),
}));

jest.mock("@/lib/groups/groups", () => ({
  createGroup: jest.fn(),
  fetchGroupMemberKeys: jest.fn(),
  fetchGroupNoteShares: jest.fn(),
  fetchGroupMembers: jest.fn().mockResolvedValue([]),
  listMyGroups: jest.fn(),
  inviteMemberByEmail: jest.fn(),
  deleteGroup: jest.fn().mockResolvedValue(undefined),
  leaveGroup: jest.fn(),
  removeGroupMember: jest.fn(),
  rotateGroupKeysWithPayload: jest.fn(),
}));

describe("group bulk delete UI", () => {
  it("lets the owner select multiple groups and confirm deletion", async () => {
    (listMyGroups as jest.Mock).mockResolvedValue([
      { id: "group-1", name: "Alpha", owner_id: "user-1" },
      { id: "group-2", name: "Beta", owner_id: "user-1" },
      { id: "group-3", name: "Gamma", owner_id: "user-2" },
    ]);

    render(<VaultPage />);

    const alphaCheckbox = await screen.findByLabelText("Select Alpha for deletion");
    const betaCheckbox = await screen.findByLabelText("Select Beta for deletion");

    fireEvent.click(alphaCheckbox);
    fireEvent.click(betaCheckbox);

    fireEvent.click(screen.getByRole("button", { name: /delete selected groups/i }));

    const dialog = screen.getByRole("dialog", { name: /delete selected groups/i });
    expect(within(dialog).getByText("Alpha")).toBeTruthy();
    expect(within(dialog).getByText("Beta")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /delete groups/i }));

    await waitFor(() => {
      expect(deleteGroup).toHaveBeenCalledTimes(2);
    });
  });
});
