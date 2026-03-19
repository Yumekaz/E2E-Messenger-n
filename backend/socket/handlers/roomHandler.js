/**
 * Room Socket Handler
 * Handles real-time room events
 */

const db = require('../../database/db');
const logger = require('../../utils/logger');
const roomService = require('../../services/roomService');
const { serializeSocketMessage } = require('../../utils/messagePayloads');
const { buildMemberSnapshot, emitMembersUpdate } = require('../../utils/roomMembers');

function createRoomHandler(io, socket, state) {
  const { users, joinRequests, socketToRooms } = state;

  /**
   * Create room
   */
  socket.on('create-room', () => {
    const user = users.get(socket.id);
    if (!user) {
      socket.emit('error', { message: 'Not registered' });
      return;
    }

    // Determine room type based on user authentication
    const roomType = user.id ? 'authenticated' : 'legacy';
    const room = roomService.create(user.id, user.username, roomType);

    socket.join(room.roomId);
    socketToRooms.get(socket.id).add(room.roomId);
    socket.emit('room-created', room);
  });

  socket.on('sync-room-key', ({ roomId, wrappedRoomKey, wrappedRoomKeyIv, keySenderUsername }) => {
    const user = users.get(socket.id);
    if (!user) {
      socket.emit('error', { message: 'Not registered' });
      return;
    }

    const dbRoom = db.getRoomById(roomId);
    if (!dbRoom) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (!db.isRoomMember(roomId, user.username)) {
      socket.emit('error', { message: 'Not a member' });
      return;
    }

    if (!wrappedRoomKey || !wrappedRoomKeyIv || keySenderUsername !== user.username) {
      socket.emit('error', { message: 'Invalid room key payload' });
      return;
    }

    db.setRoomMemberKeyMaterial(
      roomId,
      user.username,
      wrappedRoomKey,
      wrappedRoomKeyIv,
      keySenderUsername
    );
  });

  /**
   * Request to join room
   */
  socket.on('request-join', ({ roomCode }) => {
    const user = users.get(socket.id);

    if (!user) {
      socket.emit('error', { message: 'Not registered' });
      return;
    }

    // Look up room from DATABASE (not in-memory) for persistence
    const dbRoom = db.getRoomByCode(roomCode);

    if (!dbRoom) {
      socket.emit('error', { message: 'Room not found' });
      logger.warn('Room not found for join request', { roomCode });
      return;
    }

    // Existing members should be able to re-enter via room code after reconnect/reload.
    if (db.isRoomMember(dbRoom.room_id, user.username)) {
      socket.join(dbRoom.room_id);
      socketToRooms.get(socket.id)?.add(dbRoom.room_id);

      const { memberKeys } = buildMemberSnapshot(dbRoom.room_id);
      const roomMember = db.getRoomMember(dbRoom.room_id, user.username);

      socket.emit('join-approved', {
        roomId: dbRoom.room_id,
        roomCode: dbRoom.room_code,
        roomType: dbRoom.room_type || 'legacy',
        memberKeys,
        wrappedRoomKey: roomMember?.wrapped_room_key || null,
        wrappedRoomKeyIv: roomMember?.wrapped_room_key_iv || null,
        keySenderUsername: roomMember?.key_sender_username || null,
      });
      return;
    }

    // SECURITY: Enforce room type restrictions
    const userType = user.id ? 'authenticated' : 'legacy';
    const roomType = dbRoom.room_type || 'legacy'; // Default to legacy for old rooms

    if (userType !== roomType) {
      const errorMsg = userType === 'authenticated'
        ? 'Authenticated users cannot join legacy rooms. Please create your own room.'
        : 'This room requires authentication. Please sign up or log in first.';
      socket.emit('error', { message: errorMsg });
      logger.warn('Room type mismatch', {
        username: user.username,
        userType,
        roomType,
        roomCode
      });
      return;
    }

    const requestId = `req_${state.requestCounter++}`;
    joinRequests.set(requestId, {
      username: user.username,
      userId: user.id,
      publicKey: user.publicKey,
      roomId: dbRoom.room_id,
      roomCode: dbRoom.room_code,
      socketId: socket.id,
    });

    // Look up owner's current socket by username (not stale stored ID)
    const ownerSocketId = state.userToSocket.get(dbRoom.owner_username);

    logger.info('Join request received', {
      username: user.username,
      roomCode,
      roomId: dbRoom.room_id,
      roomOwner: dbRoom.owner_username,
      ownerOnline: !!ownerSocketId
    });

    if (ownerSocketId) {
      io.to(ownerSocketId).emit('join-request', {
        requestId,
        username: user.username,
        publicKey: user.publicKey,
        roomId: dbRoom.room_id,
      });
      logger.debug('Join request sent to owner', { ownerSocketId });
    } else {
      // Owner not online
      socket.emit('error', { message: 'Room owner is not online' });
      joinRequests.delete(requestId);
    }
  });

  /**
   * Approve join request
   */
  socket.on('approve-join', (
    { requestId, wrappedRoomKey, wrappedRoomKeyIv, keySenderUsername },
    callback = () => {}
  ) => {
    const request = joinRequests.get(requestId);
    if (!request) {
      callback({ ok: false, message: 'Join request expired' });
      return;
    }

    // Verify the approver is the room owner (via database)
    const user = users.get(socket.id);
    if (!user) {
      callback({ ok: false, message: 'Not registered' });
      return;
    }

    const dbRoom = db.getRoomById(request.roomId);
    if (!dbRoom || dbRoom.owner_username !== user.username) {
      socket.emit('error', { message: 'Not authorized to approve' });
      callback({ ok: false, message: 'Not authorized to approve' });
      return;
    }

    if (!wrappedRoomKey || !wrappedRoomKeyIv || keySenderUsername !== user.username) {
      socket.emit('error', { message: 'Missing room key material for approved member' });
      callback({ ok: false, message: 'Missing room key material for approved member' });
      return;
    }

    // Persist membership to database
    db.addRoomMember(request.roomId, request.userId, request.username);
    db.setRoomMemberKeyMaterial(
      request.roomId,
      request.username,
      wrappedRoomKey,
      wrappedRoomKeyIv,
      keySenderUsername
    );

    // Get the requester's socket
    const requesterSocket = io.sockets.sockets.get(request.socketId);
    if (requesterSocket) {
      requesterSocket.join(request.roomId);
      socketToRooms.get(request.socketId)?.add(request.roomId);

      const { memberKeys } = buildMemberSnapshot(request.roomId);

      requesterSocket.emit('join-approved', {
        roomId: request.roomId,
        roomCode: request.roomCode || dbRoom.room_code,
        roomType: dbRoom.room_type || 'legacy',
        memberKeys,
        wrappedRoomKey,
        wrappedRoomKeyIv,
        keySenderUsername,
      });

      socket.to(request.roomId).emit('member-joined', {
        username: request.username,
        publicKey: request.publicKey,
      });

      emitMembersUpdate(io, request.roomId);

      logger.info('Join approved', { username: request.username, roomId: request.roomId });
      callback({ ok: true });
    } else {
      callback({ ok: false, message: 'Requester is no longer connected' });
    }

    joinRequests.delete(requestId);
  });

  /**
   * Deny join request
   */
  socket.on('deny-join', ({ requestId }) => {
    const request = joinRequests.get(requestId);
    if (!request) return;

    // Verify the denier is the room owner (via database)
    const user = users.get(socket.id);
    if (!user) return;

    const dbRoom = db.getRoomById(request.roomId);
    if (!dbRoom || dbRoom.owner_username !== user.username) return;

    const requesterSocket = io.sockets.sockets.get(request.socketId);
    if (requesterSocket) {
      requesterSocket.emit('join-denied');
    }

    joinRequests.delete(requestId);
    logger.debug('Join denied', { username: request.username });
  });

  /**
   * Join existing room (reconnection)
   */
  socket.on('join-room', ({ roomId }) => {
    const user = users.get(socket.id);
    if (!user) {
      socket.emit('error', { message: 'Not registered' });
      return;
    }

    // Check room exists in database
    const dbRoom = db.getRoomById(roomId);
    if (!dbRoom) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Check membership in database
    if (!db.isRoomMember(roomId, user.username)) {
      socket.emit('error', { message: 'Not a member' });
      return;
    }

    // SECURITY: Verify room type still matches user type (prevent type switching)
    const userType = user.id ? 'authenticated' : 'legacy';
    const roomType = dbRoom.room_type || 'legacy';

    if (userType !== roomType) {
      socket.emit('error', { message: 'Room type access denied' });
      logger.warn('Room type mismatch on rejoin', {
        username: user.username,
        userType,
        roomType,
        roomId
      });
      return;
    }

    socket.join(roomId);
    socketToRooms.get(socket.id)?.add(roomId);

    const { memberKeys, members } = buildMemberSnapshot(roomId);

    // Get messages from database
    const dbMessages = db.getRoomMessages(roomId);
    const encryptedMessages = dbMessages.map(serializeSocketMessage);

    const roomMember = db.getRoomMember(roomId, user.username);

    socket.emit('room-data', {
      members,
      memberKeys,
      encryptedMessages,
      wrappedRoomKey: roomMember?.wrapped_room_key || null,
      wrappedRoomKeyIv: roomMember?.wrapped_room_key_iv || null,
      keySenderUsername: roomMember?.key_sender_username || null,
    });

    logger.debug('User joined room', { username: user.username, roomId });
  });

  /**
   * Leave room
   */
  socket.on('leave-room', ({ roomId }) => {
    const user = users.get(socket.id);
    if (!user) return;

    // Check room exists
    const dbRoom = db.getRoomById(roomId);
    if (!dbRoom) return;

    socket.leave(roomId);
    socketToRooms.get(socket.id)?.delete(roomId);

    // Remove from database
    db.removeRoomMember(roomId, user.username);

    // Notify others
    io.to(roomId).emit('member-left', { username: user.username });

    emitMembersUpdate(io, roomId);

    // Delete room if owner leaves
    if (dbRoom.owner_username === user.username) {
      db.deleteRoom(roomId);
      io.to(roomId).emit('room-closed');
      logger.info('Room closed', { roomId });
    }

    logger.info('User left room', { username: user.username, roomId });
  });
}

module.exports = createRoomHandler;
