import { afterEach, describe, expect, it, vi } from "vitest";
import { authService } from "./auth-service";

afterEach(() => vi.unstubAllGlobals());

describe("staff auth service", () => {
  it("posts credentials only to the common guarded staff endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { user: { id: "u1" } } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await authService.login(
      { email: "person@example.com", password: "Password123!", rememberMe: false }
    );

    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe("/api/v1/auth/admin/login");
  });

  it("preserves a validated portal when requesting a password reset", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { message: "Check your email" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await authService.forgotPassword({ email: "coach@example.com" }, "admin");

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/v1/auth/forgot-password");
    expect(url.searchParams.get("portal")).toBe("admin");
  });
});
