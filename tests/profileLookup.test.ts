import { lookupProfileByEmail } from "@/lib/supabase/profiles";

const rpcMock = jest.fn();

jest.mock("@/lib/supabaseClient", () => ({
  getSupabaseClient: () => ({
    rpc: rpcMock,
  }),
}));

describe("lookupProfileByEmail", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns null when no profile is found", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    await expect(lookupProfileByEmail("missing@example.com")).resolves.toBeNull();
  });

  it("returns the first matching profile", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { user_id: "user-1", box_public_key: "pubkey-1" },
        { user_id: "user-2", box_public_key: "pubkey-2" },
      ],
      error: null,
    });

    await expect(lookupProfileByEmail("user@example.com")).resolves.toEqual({
      userId: "user-1",
      boxPublicKeyB64: "pubkey-1",
    });
  });
});
