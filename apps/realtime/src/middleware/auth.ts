import type { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "@cms/shared";
import { prisma } from "../lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

// Connected sockets are forced to re-prove current database authorization at
// least every 15 seconds, bounding access after reset or deactivation.
export const AUTH_REVALIDATION_INTERVAL_MS = 15_000;
export const AUTH_LOOKUP_TIMEOUT_MS = 5_000;

export type RealtimeAuthUser = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  isActive: boolean;
  authVersion: number;
};

export type AuthUserLookup = (userId: string) => Promise<RealtimeAuthUser | null>;

type TimedLookup = {
  promise: Promise<RealtimeAuthUser | null>;
  cancel: () => void;
};

function startTimedLookup(
  lookup: AuthUserLookup,
  userId: string,
  timeoutMs = AUTH_LOOKUP_TIMEOUT_MS
): TimedLookup {
  let settled = false;
  let rejectOuter: (reason: Error) => void = () => undefined;
  let timeout: ReturnType<typeof setTimeout>;

  const promise = new Promise<RealtimeAuthUser | null>((resolve, reject) => {
    rejectOuter = reject;
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      action();
    };

    // Both resolution and rejection handlers remain attached after timeout,
    // so a late database rejection can never become unhandled.
    Promise.resolve()
      .then(() => lookup(userId))
      .then(
        (user) => settle(() => resolve(user)),
        (error: unknown) => settle(() => reject(
          error instanceof Error ? error : new Error("Authentication lookup failed")
        ))
      );

    timeout = setTimeout(
      () => settle(() => reject(new Error("Authentication lookup timed out"))),
      timeoutMs
    );
    timeout.unref();
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectOuter(new Error("Authentication lookup cancelled"));
    },
  };
}

export const findRealtimeAuthUser: AuthUserLookup = (userId) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      authVersion: true,
    },
  });

function hasCurrentAuthorization(
  user: RealtimeAuthUser | null,
  userId: string,
  authVersion: number
): user is RealtimeAuthUser {
  return Boolean(
    user && user.id === userId && user.isActive && user.authVersion === authVersion
  );
}

export function createAuthMiddleware(lookup: AuthUserLookup = findRealtimeAuthUser) {
  return async function realtimeAuthMiddleware(
    socket: Socket,
    next: (err?: Error) => void
  ) {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      return next(new Error("Authentication required. No token provided."));
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return next(new Error("Token expired. Please refresh your token."));
      }
      if (error instanceof jwt.JsonWebTokenError) {
        return next(new Error("Invalid token. Authentication failed."));
      }
      return next(new Error("Authentication failed."));
    }

    if (
      typeof payload.sub !== "string" ||
      payload.sub.length === 0 ||
      !Number.isInteger(payload.authVersion) ||
      payload.authVersion < 0
    ) {
      return next(new Error("Invalid token. Authentication failed."));
    }

    let user: RealtimeAuthUser | null;
    try {
      user = await startTimedLookup(lookup, payload.sub).promise;
    } catch {
      return next(new Error("Authentication service unavailable."));
    }

    if (!hasCurrentAuthorization(user, payload.sub, payload.authVersion)) {
      return next(new Error("Authentication failed."));
    }

    // Authorization-relevant identity comes from the current database row,
    // never from client-controlled handshake data or stale token claims.
    socket.data.userId = user.id;
    socket.data.email = user.email;
    socket.data.role = user.role;
    socket.data.userName = user.name;
    socket.data.authVersion = user.authVersion;

    return next();
  };
}

export const authMiddleware = createAuthMiddleware();

export function startAuthRevalidation(
  socket: Socket,
  lookup: AuthUserLookup = findRealtimeAuthUser,
  intervalMs = AUTH_REVALIDATION_INTERVAL_MS
) {
  let checkInProgress = false;
  let stopped = false;
  let activeLookup: TimedLookup | null = null;
  const timer = setInterval(async () => {
    if (stopped || checkInProgress || !socket.connected) return;
    checkInProgress = true;
    try {
      const userId = socket.data.userId as string | undefined;
      const authVersion = socket.data.authVersion as number | undefined;
      if (!userId || !Number.isInteger(authVersion)) {
        socket.disconnect(true);
        return;
      }

      const lookupAttempt = startTimedLookup(lookup, userId);
      activeLookup = lookupAttempt;
      const user = await lookupAttempt.promise;
      if (!hasCurrentAuthorization(user, userId, authVersion as number)) {
        socket.disconnect(true);
      }
    } catch {
      // Fail closed: an unavailable authorization store must not extend access.
      if (!stopped) socket.disconnect(true);
    } finally {
      activeLookup = null;
      checkInProgress = false;
    }
  }, intervalMs);

  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
    activeLookup?.cancel();
    activeLookup = null;
  };
}
