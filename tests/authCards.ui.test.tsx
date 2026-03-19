import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LoginCard } from "@/components/auth/LoginCard";
import { SignupCard } from "@/components/auth/SignupCard";

const pushMock = jest.fn();
const signInWithPasswordMock = jest.fn();
const signUpMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: jest.fn() }),
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
  beforeEach(() => {
    pushMock.mockReset();
    signInWithPasswordMock.mockReset();
    signUpMock.mockReset();
  });

  it("shows a login error and clears loading when sign-in throws", async () => {
    signInWithPasswordMock.mockRejectedValue(new Error("Network down"));

    render(<LoginCard />);

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await screen.findByText("Network down");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Log in" }).hasAttribute("disabled")).toBe(false)
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows signup confirmation feedback when email verification is required", async () => {
    signUpMock.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    render(<SignupCard />);

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Minimum 8 characters"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await screen.findByText(
      "Account created. Check your email to confirm your account before logging in."
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign up" }).hasAttribute("disabled")).toBe(false)
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
