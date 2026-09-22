import { Server } from "socket.io";

let io = null;

/**
 * Initialises Socket.io on the given HTTP server and registers all
 * workspace-room lifecycle events.
 *
 * @param {import("http").Server} httpServer - The Node.js HTTP server instance.
 * @returns {import("socket.io").Server} The Socket.io server instance.
 */
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*", // tighten to your client URL in production
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Client sends this immediately after connecting, carrying the workspaceId
    // they are currently viewing. This puts them in the correct room so they
    // only receive broadcasts for their workspace (multi-tenant isolation).
    socket.on("join:workspace", (workspaceId) => {
      // Leave any previously joined workspace room first
      const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
      rooms.forEach((room) => socket.leave(room));

      socket.join(`workspace:${workspaceId}`);
      console.log(`[Socket] ${socket.id} joined workspace:${workspaceId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Broadcasts a named event with data to every socket in a workspace room,
 * EXCLUDING the socket that triggered the change (so the originator doesn't
 * receive a duplicate update on top of their optimistic UI update).
 *
 * @param {string} workspaceId - The workspace whose room gets the broadcast.
 * @param {string} event       - Socket event name (e.g. "task:updated").
 * @param {object} data        - Payload sent to clients.
 * @param {string} [excludeSocketId] - Socket ID to exclude from broadcast.
 */
export const broadcastToWorkspace = (workspaceId, event, data, excludeSocketId) => {
  if (!io) return;

  const room = `workspace:${workspaceId}`;

  if (excludeSocketId) {
    // Broadcast to everyone in the room except the sender
    io.to(room).except(excludeSocketId).emit(event, data);
  } else {
    io.to(room).emit(event, data);
  }
};

/**
 * Returns the active Socket.io server instance.
 * Returns null if initSocket() has not been called yet.
 */
export const getIO = () => io;
