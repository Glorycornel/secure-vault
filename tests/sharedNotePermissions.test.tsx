import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SharedNoteViewPage from "@/app/(vault)/shared/[id]/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "note-1" }),
}));

jest.mock("@/hooks/useVault", () => ({
  useVault: () => ({ key: {} as CryptoKey, isUnlocked: true }),
}));

jest.mock("@/lib/db/indexedDb", () => ({
  getSharedEncryptedNote: jest.fn(),
  upsertSharedEncryptedNote: jest.fn(),
}));

jest.mock("@/lib/notes/noteCrypto", () => ({
  decryptAnyNotePayload: jest.fn().mockResolvedValue({ title: "Shared", body: "Body" }),
  encryptNoteWithPerNoteKey: jest.fn().mockResolvedValue({
    payload: { iv: "iv", ciphertext: "ct" },
  }),
}));

jest.mock("@/lib/supabase/sharedNotes", () => ({
  updateSharedNotePayload: jest.fn().mockResolvedValue(undefined),
}));

describe("SharedNoteViewPage permissions", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { decryptAnyNotePayload, encryptNoteWithPerNoteKey } = jest.requireMock(
      "@/lib/notes/noteCrypto"
    );
    decryptAnyNotePayload.mockResolvedValue({ title: "Shared", body: "Body" });
    encryptNoteWithPerNoteKey.mockResolvedValue({
      payload: { iv: "iv", ciphertext: "ct" },
    });
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it("renders read-only view when permission is read", async () => {
    const { getSharedEncryptedNote } = jest.requireMock("@/lib/db/indexedDb");
    getSharedEncryptedNote.mockResolvedValue({
      id: "note-1",
      payload: { iv: "iv", ciphertext: "ct" },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      permission: "read",
    });

    render(<SharedNoteViewPage />);

    expect(await screen.findByText("Read-only")).toBeTruthy();
    expect(screen.queryByText("Save changes")).toBeNull();
  });

  it("allows editing when permission is write", async () => {
    const { getSharedEncryptedNote, upsertSharedEncryptedNote } =
      jest.requireMock("@/lib/db/indexedDb");
    const { updateSharedNotePayload } = jest.requireMock("@/lib/supabase/sharedNotes");
    getSharedEncryptedNote.mockResolvedValue({
      id: "note-1",
      payload: { iv: "iv", ciphertext: "ct" },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      permission: "write",
    });

    render(<SharedNoteViewPage />);

    const button = await screen.findByText("Save changes");
    fireEvent.click(button);

    await waitFor(() => {
      expect(updateSharedNotePayload).toHaveBeenCalled();
      expect(upsertSharedEncryptedNote).toHaveBeenCalled();
    });
  });
});
