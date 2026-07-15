import type { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "@cms/shared";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

/**
 * Socket.IO authentication middleware.
 * Verifies JWT token from handshake auth and attaches user data to socket.
 */
export function authMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    return next(new Error("Authentication required. No token provided."));
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;

    // Attach user data to socket for use in handlers
    socket.data.userId = payload.sub;
    socket.data.email = payload.email;
    socket.data.role = payload.role;
    socket.data.userName = payload.name;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new Error("Token expired. Please refresh your token."));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new Error("Invalid token. Authentication failed."));
    }
    return next(new Error("Authentication failed."));
  }
}
