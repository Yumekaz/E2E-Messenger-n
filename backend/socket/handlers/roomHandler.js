/**
 * Room Socket Handler
 * Handles real-time room events
 */

const crypto = require('crypto');
const db = require('../../database/db');
const logger = require('../../utils/logger');

function createRoomHandler(io, socket, state) {
  const { users, rooms, joinRequests, socketToRooms } = state;

  /**
   * Generate secure room code
   */
  function generateRoomCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  /**
   * Build a room member list and key map from persistent storage
   */
  function buildMemberSnapshot(roomId) {
    const dbMembers = db.getRoomMembers(roomId);
    const memberKeys = {};
    const memberList = [];

    for (const member of dbMembers) {
      memberList.push(member.username);
      if (member.public_key) {
        memberKeys[member.username] = member.public_key;
      }
    }

    return { memberKeys, memberList };
  }

  /**
   * Create room
   */
  socket.on('create-room', () => {
    const user = users.get(socket.id);
    if (!user) {
      socket.emit('error', { message: 'Not registered' });
      return;
    }

    const roomId = `room_${state.roomCounter++}_${Date.now()}`;
    const roomCode = generateRoomCode();

    // Determine room type based on user authentication
    const roomType = user.id ? 'authenticated' : 'legacy';

    const room = {
      owner: user.username,
      ownerId: user.id,
      ownerSocketId: socket.id,
      code: roomCode,
      roomType: roomType,
      members: new Map([[user.username, user.publicKey]]),
      encryptedMessages: [],
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    socketToRooms.get(socket.id).add(roomId);

    // Persist to database with room type
    db.createRoom(roomId, roomCode, user.id, user.username, roomType);

    socket.emit('room-created', { roomId, roomCode, roomType });
    logger.info('Room created', { roomId, roomCode, owner: user.username, roomType });
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

    // Check if already a member (via database)
    if (db.isRoomMember(dbRoom.room_id, user.username)) {
      socket.emit('error', { message: 'Already in room' });
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
  socket.on('approve-join', ({ requestId }) => {
    const request = joinRequests.get(requestId);
    if (!request) return;

    // Verify the approver is the room owner (via database)
    const user = users.get(socket.id);
    if (!user) return;

    const dbRoom = db.getRoomById(request.roomId);
    if (!dbRoom || dbRoom.owner_username !== user.username) {
      socket.emit('error', { message: 'Not authorized to approve' });
      return;
    }

    // Persist membership to database
    db.addRoomMember(request.roomId, request.userId, request.username);

    // Get the requester's socket
    const requesterSocket = io.sockets.sockets.get(request.socketId);
    if (requesterSocket) {
      requesterSocket.join(request.roomId);
      socketToRooms.get(request.socketId)?.add(request.roomId);

      const { memberKeys, memberList } = buildMemberSnapshot(request.roomId);

      requesterSocket.emit('join-approved', {
        roomId: request.roomId,
        roomCode: request.roomCode || dbRoom.room_code,
        roomType: dbRoom.room_type || 'legacy',
        memberKeys,
      });

      socket.to(request.roomId).emit('member-joined', {
        username: request.username,
        publicKey: request.publicKey,
      });

      io.to(request.roomId).emit('members-update', {
        members: memberList,
        memberKeys,
      });

      logger.info('Join approved', { username: request.username, roomId: request.roomId });
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

    const { memberKeys, memberList } = buildMemberSnapshot(roomId);

    // Get messages from database
    const dbMessages = db.getRoomMessages(roomId);
    const encryptedMessages = dbMessages.map(msg => {
      const message = {
        id: msg.message_id,
        senderUsername: msg.sender_username,
        encryptedData: msg.encrypted_data,
        iv: msg.iv,
        timestamp: new Date(msg.created_at).getTime(),
      };

      if (msg.attachment_id) {
        // Helper to infer mimetype from filename (prefer original name)
        const nameToCheck = msg.original_name || msg.filename;
        const ext = nameToCheck.split('.').pop().toLowerCase();
        const mimeMap = {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif',
          'webp': 'image/webp'
        };
        const inferredMime = mimeMap[ext];

        message.attachment = {
          id: msg.attachment_id,
          filename: msg.filename,
          url: `/api/files/${msg.attachment_id}`, // Use API route for retrieval
          // Use original type, or inferred type, or stored mimetype
          mimetype: msg.original_type || inferredMime || msg.mimetype,
          size: msg.size,
          encrypted: !!msg.encrypted,
          iv: msg.attachment_iv,
          metadata: msg.metadata
        };

        // If encrypted, use original type for display if available
        // (Handled above in mimetype assignment)
      }
      return message;
    });

    socket.emit('room-data', {
      members: memberList,
      memberKeys,
      encryptedMessages,
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

    const { memberKeys, memberList } = buildMemberSnapshot(roomId);

    io.to(roomId).emit('members-update', {
      members: memberList,
      memberKeys,
    });

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
