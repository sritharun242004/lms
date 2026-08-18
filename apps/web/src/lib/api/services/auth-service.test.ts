import { afterEach, describe, expect, it, vi } from "vitest";
import { authService } from "./auth-service";

afterEach(() => vi.unstubAllGlobals());

describe("staff auth service", () => {
  it.each([
    ["coach", "/api/v1/auth/coach/login"],
    ["super-admin", "/api/v1/auth/super-admin/login"],
  ] as const)("posts %s credentials only to its guarded endpoint", async (portal, expectedPath) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { user: { id: "u1" } } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await authService.login(
      { email: "person@example.com", password: "Password123!", rememberMe: false },
      portal
    );

    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe(expectedPath);
  });

  it("preserves a validated portal when requesting a password reset", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { message: "Check your email" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await authService.forgotPassword({ email: "coach@example.com" }, "coach");

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/v1/auth/forgot-password");
    expect(url.searchParams.get("portal")).toBe("coach");
  });
});
