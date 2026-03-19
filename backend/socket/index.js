/**
 * Socket.IO Setup
 * Configures Socket.IO server and registers all handlers
 */

const db = require('../database/db');
const config = require('../config');
const logger = require('../utils/logger');
const { authenticateSocket } = require('../middleware/auth');
const authService = require('../services/authService');
const createMessageHandler = require('./handlers/messageHandler');
const createRoomHandler = require('./handlers/roomHandler');
const { emitMembersUpdate } = require('../utils/roomMembers');
const { evaluateLocalNetworkAccess } = require('../utils/localNetwork');

/**
 * Shared state between socket handlers
 */
const state = {
  users: new Map(),           // socketId -> { username, publicKey, id }
  usernames: new Set(),       // Set of active usernames
  userToSocket: new Map(),    // username -> socketId (for looking up owner by username)
  joinRequests: new Map(),    // requestId -> request object
  socketToRooms: new Map(),   // socketId -> Set of roomIds
  requestCounter: 0,
};

/**
 * Setup Socket.IO handlers
 */
function setupSocketHandlers(io) {
  io.use((socket, next) => {
    if (!config.network.localOnly) {
      next();
      return;
    }

    const forwardedAddress = config.network.trustProxy
      ? socket.handshake.headers['x-forwarded-for']
      : null;
    const access = evaluateLocalNetworkAccess(forwardedAddress || socket.handshake.address);

    if (access.allowed) {
      socket.localNetwork = access;
      next();
      return;
    }

    logger.warn('Rejected non-local socket connection', {
      socketId: socket.id,
      remoteAddress: access.normalizedAddress || socket.handshake.address,
    });

    const error = new Error('Local network access only. Connect from the same Wi-Fi, hotspot, or LAN.');
    error.data = { code: 'LOCAL_NETWORK_ONLY' };
    next(error);
  });

  // Authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    logger.debug('Socket connected', { socketId: socket.id });

    const rejectExpiredAuth = () => {
      if (!socket.authInvalid) {
        return false;
      }

      socket.emit('auth-expired');
      logger.warn('Rejected socket action due to invalid auth token', {
        socketId: socket.id,
      });
      return true;
    };

    // Register user
    socket.on('register', ({ username, publicKey }) => {
      if (rejectExpiredAuth()) {
        return;
      }

      // Check if username is taken
      if (state.usernames.has(username)) {
        // Check if the previous owner is still connected (Zombie check)
        const oldSocketId = state.userToSocket.get(username);
        const oldSocket = oldSocketId ? io.sockets.sockets.get(oldSocketId) : null;

        // Only reject if there's an ACTIVE different socket with this username
        if (oldSocket && oldSocket.connected && oldSocket.id !== socket.id) {
          socket.emit('username-taken');
          logger.warn('Username already in use by active socket', {
            username,
            newSocketId: socket.id,
            existingSocketId: oldSocketId
          });
          return;
        }

        // Clean up zombie session (old socket disconnected or doesn't exist)
        if (oldSocketId && oldSocketId !== socket.id) {
          logger.info('Cleaning up zombie session', { username, oldSocketId });
          state.users.delete(oldSocketId);
          state.socketToRooms.delete(oldSocketId);
          state.usernames.delete(username);
          state.userToSocket.delete(username);
        }
      }

      // Get user ID from JWT if authenticated
      const userId = socket.user?.userId || null;

      // Store user info
      state.users.set(socket.id, {
        username,
        publicKey,
        id: userId
      });
      state.usernames.add(username);
      state.userToSocket.set(username, socket.id);
      state.socketToRooms.set(socket.id, new Set());

      // Persist to database
      if (userId) {
        db.updateUserPublicKey(userId, publicKey);
      } else {
        db.upsertUser(username, publicKey);
      }

      socket.emit('registered', { username });
      logger.info('User registered', { username, authenticated: !!userId });
    });

    /**
     * Request a one-time upload token (valid for 5 mins)
     * Allows legacy users to upload files via HTTP
     */
    socket.on('request-upload-token', () => {
      if (rejectExpiredAuth()) {
        return;
      }

      const user = state.users.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'Not registered' });
        return;
      }

      // Generate limited-scope token
      const token = authService.generateLegacyUploadToken(user.username);

      socket.emit('upload-token', { token });
      logger.debug('Issued legacy upload token', { username: user.username });
    });

    // Setup handlers
    createRoomHandler(io, socket, state);
    createMessageHandler(io, socket, state);

    // Handle disconnect
    socket.on('disconnect', () => {
      const user = state.users.get(socket.id);
      if (!user) return;

      // Transient network loss should not destroy persisted room state.
      const userRooms = state.socketToRooms.get(socket.id) || new Set();
      for (const roomId of userRooms) {
        if (db.getRoomById(roomId)) {
          emitMembersUpdate(io, roomId);
        }
      }

      // Cleanup
      state.users.delete(socket.id);
      state.usernames.delete(user.username);
      state.userToSocket.delete(user.username);
      state.socketToRooms.delete(socket.id);

      logger.info('User disconnected', { username: user.username });
    });
  });

  logger.info('Socket.IO handlers initialized');
}

module.exports = setupSocketHandlers;
