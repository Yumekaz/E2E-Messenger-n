import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from './types';

const SOCKET_URL: string = window.location.origin;

// Get token from localStorage
function getAuthToken(): string | null {
  return localStorage.getItem('accessToken');
}

// Socket type with our custom events
type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type SocketAuthState = { token: string | null };

function setSocketAuthToken(token: string | null): void {
  (socket.auth as SocketAuthState).token = token;
}

// Create socket with auth token
export const socket: TypedSocket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
  auth: {
    token: getAuthToken(),
  },
});

// Ensure the current token is attached before each reconnect attempt.
socket.io.on('reconnect_attempt', () => {
  setSocketAuthToken(getAuthToken());
});

// Reconnect with new token after login
export function reconnectWithAuth(): void {
  setSocketAuthToken(getAuthToken());
  socket.disconnect();
  socket.connect();
}

export function reconnectWithoutAuth(): void {
  setSocketAuthToken(null);
  socket.disconnect();
  socket.connect();
}

export { setSocketAuthToken };

export default socket;
