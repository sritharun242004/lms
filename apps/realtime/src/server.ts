import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import { authMiddleware } from "./middleware/auth";
import { registerChatHandlers } from "./handlers/chat";
import { registerPresenceHandlers } from "./handlers/presence";
import type { SocketEvents } from "@cms/shared";

// ============================================================
// SERVER CONFIGURATION
// ============================================================

const PORT = parseInt(process.env.SOCKET_PORT || "4000", 10);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const INTERNAL_SECRET =
  process.env.INTERNAL_SECRET || "dev-internal-secret-change-in-production";

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const httpServer = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
    return;
  }

  // Internal endpoint: the Next.js API server pushes message events here
  // after mutating the database, so connected clients get them instantly
  // instead of waiting for their next poll.
  if (req.url === "/internal/broadcast" && req.method === "POST") {
    if (req.headers["x-internal-secret"] !== INTERNAL_SECRET) {
      res.writeHead(401);
      res.end();
      return;
    }

    readBody(req)
      .then((raw) => {
        const { groupId, event, data } = JSON.parse(raw) as {
          groupId: string;
          event: string;
          data: unknown;
        };
        if (!groupId || !event) {
          res.writeHead(400);
          res.end();
          return;
        }
        io.to(`group:${groupId}`).emit(event, data);
        res.writeHead(204);
        res.end();
      })
      .catch(() => {
        res.writeHead(400);
        res.end();
      });
    return;
  }

  res.writeHead(404);
  res.end();
});

// ============================================================
// SOCKET.IO SETUP
// ============================================================

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
});

// ============================================================
// MIDDLEWARE
// ============================================================

io.use(authMiddleware);

// ============================================================
// CONNECTION HANDLING
// ============================================================

// Track online users: userId → Set<socketId>
const onlineUsers = new Map<string, Set<string>>();

io.on("connection", (socket) => {
  const userId = socket.data.userId;
  const userName = socket.data.userName;

  console.log(`✓ User connected: ${userName} (${userId}) - Socket: ${socket.id}`);

  // Track online status
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId)!.add(socket.id);

  // Broadcast online status
  socket.broadcast.emit("user:online", {
    userId,
    status: "ONLINE" as const,
  });

  // Register event handlers
  registerChatHandlers(io, socket);
  registerPresenceHandlers(io, socket, onlineUsers);

  // Handle disconnect
  socket.on("disconnect", (reason) => {
    console.log(`✗ User disconnected: ${userName} (${userId}) - Reason: ${reason}`);

    const userSockets = onlineUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
        // Broadcast offline status only when all sockets are gone
        socket.broadcast.emit("user:online", {
          userId,
          status: "OFFLINE" as const,
        });
      }
    }
  });

  socket.on("error", (error) => {
    console.error(`Socket error for ${userName}:`, error.message);
  });
});

// ============================================================
// START SERVER
// ============================================================

httpServer.listen(PORT, () => {
  console.log(`
  ┌──────────────────────────────────────────┐
  │                                          │
  │   🚀 Mentor Connect Realtime Server      │
  │                                          │
  │   Port:    ${PORT}                          │
  │   Client:  ${CLIENT_URL}         │
  │   Status:  Running                       │
  │                                          │
  └──────────────────────────────────────────┘
  `);
});

export { io, httpServer };
