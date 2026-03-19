import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LoginCard } from "@/components/auth/LoginCard";
import { SignupCard } from "@/components/auth/SignupCard";

const assignMock = jest.fn();
const signInWithPasswordMock = jest.fn();
const signUpMock = jest.fn();
let assignSpy: jest.SpiedFunction<typeof window.location.assign>;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/lib/supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpMock,
    },
  }),
}));

describe("auth cards", () => {
  beforeAll(() => {
    assignSpy = jest.spyOn(window.location, "assign").mockImplementation(assignMock);
  });

  afterAll(() => {
    assignSpy.mockRestore();
  });

  beforeEach(() => {
    assignMock.mockReset();
    signInWithPasswordMock.mockReset();
    signUpMock.mockReset();
  });

  it("shows a login error and clears loading when sign-in throws", async () => {
    signInWithPasswordMock.mockRejectedValue(new Error("Network down"));

    render(<LoginCard />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await screen.findByText("Network down");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Log in" }).hasAttribute("disabled")
      ).toBe(false)
    );
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("shows signup confirmation feedback when email verification is required", async () => {
    signUpMock.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    render(<SignupCard />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await screen.findByText(
      "Account created. Check your email to confirm your account before logging in."
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Sign up" }).hasAttribute("disabled")
      ).toBe(false)
    );
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("hard-navigates to the vault after a successful login session", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });

    render(<LoginCard />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/vault"));
  });

  it("blocks signup when passwords do not match", async () => {
    render(<SignupCard />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password124" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await screen.findByText("Passwords do not match.");
    expect(signUpMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });
});
