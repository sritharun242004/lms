import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_REVALIDATION_INTERVAL_MS,
  AUTH_LOOKUP_TIMEOUT_MS,
  createAuthMiddleware,
  startAuthRevalidation,
  type RealtimeAuthUser,
} from "./auth";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

function token(overrides: Record<string, unknown> = {}) {
  return jwt.sign({
    sub: "user-1",
    name: "Untrusted Name",
    email: "untrusted@example.com",
    role: "ADMIN",
    authVersion: 3,
    ...overrides,
  }, SECRET, { expiresIn: "5m" });
}

function socketWith(authToken = token()) {
  return {
    handshake: { auth: { token: authToken } },
    data: {},
    connected: true,
    disconnect: vi.fn(),
  };
}

const currentUser: RealtimeAuthUser = {
  id: "user-1",
  name: "Current Coach",
  email: "coach@example.com",
  role: "MENTOR",
  isActive: true,
  authVersion: 3,
};

async function authenticate(
  lookup: (userId: string) => Promise<RealtimeAuthUser | null>,
  authToken = token()
) {
  const socket = socketWith(authToken);
  const error = await new Promise<Error | undefined>((resolve) => {
    createAuthMiddleware(lookup)(socket as never, resolve);
  });
  return { socket, error };
}

describe("realtime authentication", () => {
  it("accepts a current active user and uses only database identity and role", async () => {
    const lookup = vi.fn().mockResolvedValue(currentUser);

    const { socket, error } = await authenticate(lookup);

    expect(error).toBeUndefined();
    expect(lookup).toHaveBeenCalledWith("user-1");
    expect(socket.data).toEqual({
      userId: "user-1",
      userName: "Current Coach",
      email: "coach@example.com",
      role: "MENTOR",
      authVersion: 3,
    });
  });

  it("rejects an inactive database user", async () => {
    const { error } = await authenticate(vi.fn().mockResolvedValue({ ...currentUser, isActive: false }));
    expect(error?.message).toBe("Authentication failed.");
  });

  it("rejects a signed token whose auth version is stale", async () => {
    const { error } = await authenticate(vi.fn().mockResolvedValue({ ...currentUser, authVersion: 4 }));
    expect(error?.message).toBe("Authentication failed.");
  });

  it("accepts a legacy missing-version token only for database version zero", async () => {
    const legacyToken = token({ authVersion: undefined });
    const accepted = await authenticate(
      vi.fn().mockResolvedValue({ ...currentUser, authVersion: 0 }), legacyToken
    );
    expect(accepted.error).toBeUndefined();
    expect(accepted.socket.data).toMatchObject({ userId: "user-1", role: "MENTOR", authVersion: 0 });

    const rejected = await authenticate(
      vi.fn().mockResolvedValue({ ...currentUser, authVersion: 1 }), legacyToken
    );
    expect(rejected.error?.message).toBe("Authentication failed.");
  });

  it.each([
    ["user id", { sub: undefined }],
    ["role", { role: undefined }],
    ["valid auth version", { authVersion: null }],
  ])("still rejects a signed token missing its %s", async (_field, overrides) => {
    const lookup = vi.fn().mockResolvedValue({ ...currentUser, authVersion: 0 });
    const { error } = await authenticate(lookup, token(overrides));

    expect(error?.message).toBe("Invalid token. Authentication failed.");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("fails closed without leaking details when the database lookup fails", async () => {
    const { error } = await authenticate(vi.fn().mockRejectedValue(new Error("database offline")));
    expect(error?.message).toBe("Authentication service unavailable.");
    expect(error?.message).not.toContain("database offline");
  });

  it("denies an initial handshake when the database lookup never settles", async () => {
    vi.useFakeTimers();
    const authentication = authenticate(vi.fn(
      () => new Promise<RealtimeAuthUser | null>(() => undefined)
    ));

    await vi.advanceTimersByTimeAsync(AUTH_LOOKUP_TIMEOUT_MS);
    const { error } = await authentication;

    expect(error?.message).toBe("Authentication service unavailable.");
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("handles a lookup rejection that arrives after the handshake deadline", async () => {
    vi.useFakeTimers();
    const lookup = vi.fn(() => new Promise<RealtimeAuthUser | null>((_resolve, reject) => {
      setTimeout(() => reject(new Error("late database failure")), AUTH_LOOKUP_TIMEOUT_MS + 1_000);
    }));
    const authentication = authenticate(lookup);

    await vi.advanceTimersByTimeAsync(AUTH_LOOKUP_TIMEOUT_MS);
    const { error } = await authentication;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(error?.message).toBe("Authentication service unavailable.");
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});

describe("connected realtime session revocation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([
    ["auth version changes", { ...currentUser, authVersion: 4 }],
    ["the account becomes inactive", { ...currentUser, isActive: false }],
  ])("disconnects within the bounded interval after %s", async (_reason, changedUser) => {
    const socket = socketWith() as ReturnType<typeof socketWith> & {
      data: { userId: string; authVersion: number };
    };
    socket.data = { userId: "user-1", authVersion: 3 };
    const lookup = vi.fn().mockResolvedValue(changedUser);

    const stop = startAuthRevalidation(socket as never, lookup);
    await vi.advanceTimersByTimeAsync(AUTH_REVALIDATION_INTERVAL_MS);

    expect(lookup).toHaveBeenCalledWith("user-1");
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    stop();
  });

  it("keeps a legacy-established version-zero socket only while the database stays at zero", async () => {
    const socket = socketWith() as ReturnType<typeof socketWith> & {
      data: { userId: string; authVersion: number };
    };
    socket.data = { userId: "user-1", authVersion: 0 };
    const lookup = vi.fn().mockResolvedValue({ ...currentUser, authVersion: 0 });

    const stop = startAuthRevalidation(socket as never, lookup);
    await vi.advanceTimersByTimeAsync(AUTH_REVALIDATION_INTERVAL_MS);

    expect(socket.disconnect).not.toHaveBeenCalled();
    stop();
  });

  it("fails closed by interval plus timeout when a connected lookup is too slow", async () => {
    const socket = socketWith() as ReturnType<typeof socketWith> & {
      data: { userId: string; authVersion: number };
    };
    socket.data = { userId: "user-1", authVersion: 3 };
    const lookup = vi.fn(() => new Promise<RealtimeAuthUser | null>((resolve) => {
      setTimeout(() => resolve(currentUser), AUTH_LOOKUP_TIMEOUT_MS + 1_000);
    }));

    const stop = startAuthRevalidation(socket as never, lookup);
    await vi.advanceTimersByTimeAsync(
      AUTH_REVALIDATION_INTERVAL_MS + AUTH_LOOKUP_TIMEOUT_MS - 1
    );
    expect(socket.disconnect).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    stop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
