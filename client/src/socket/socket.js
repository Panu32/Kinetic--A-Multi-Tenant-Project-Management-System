import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

let socket = null;

/**
 * Creates (or returns the existing) Socket.io connection.
 * Called once from Layout.jsx when the user is authenticated.
 */
export const connectSocket = () => {
  if (socket && socket.connected) return socket;

  socket = io(SOCKET_URL, {
    // Use WebSocket as primary transport; fall back to polling if needed
    transports: ["websocket", "polling"],
    // Automatically attempt reconnection with exponential backoff
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on("connect", () => {
    console.log("[Socket] Connected:", socket.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    console.warn("[Socket] Connection error:", err.message);
  });

  return socket;
};

/**
 * Joins the Socket.io room for a specific workspace.
 * Call this whenever the active workspace changes.
 *
 * @param {string} workspaceId
 */
export const joinWorkspace = (workspaceId) => {
  if (!socket || !workspaceId) return;
  socket.emit("join:workspace", workspaceId);
  console.log("[Socket] Joined workspace room:", workspaceId);
};

/**
 * Gracefully closes the socket connection.
 * Called when the user logs out or the Layout unmounts.
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log("[Socket] Manually disconnected.");
  }
};

/**
 * Returns the current socket instance (may be null if not connected yet).
 */
export const getSocket = () => socket;
