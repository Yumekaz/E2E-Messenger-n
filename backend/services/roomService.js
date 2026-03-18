/**
 * Room Service
 * Handles room creation, joining, and management
 */

const crypto = require('crypto');
const db = require('../database/db');
const logger = require('../utils/logger');
const { NotFoundError, AuthorizationError, ValidationError } = require('../utils/errors');

class RoomService {
  constructor() {
    this.roomCounter = 0;
  }

  /**
   * Generate secure 6-character room code
   */
  generateRoomCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  /**
   * Generate unique room ID
   */
  generateRoomId() {
    return `room_${++this.roomCounter}_${Date.now()}`;
  }

  /**
   * Create a new room
   */
  create(userId, username, roomType = userId ? 'authenticated' : 'legacy') {
    const roomId = this.generateRoomId();
    const roomCode = this.generateRoomCode();

    const room = db.createRoom(roomId, roomCode, userId, username, roomType);

    logger.info('Room created', { roomId, roomCode, owner: username, roomType });

    return room;
  }

  /**
   * Get room by code
   */
  getByCode(roomCode) {
    const room = db.getRoomByCode(roomCode.toUpperCase());

    if (!room) {
      throw new NotFoundError('Room');
    }

    return room;
  }

  /**
   * Get room by ID
   */
  getById(roomId) {
    const room = db.getRoomById(roomId);

    if (!room) {
      throw new NotFoundError('Room');
    }

    return room;
  }

  /**
   * Add member to room
   */
  addMember(roomId, userId, username) {
    const room = db.getRoomById(roomId);

    if (!room) {
      throw new NotFoundError('Room');
    }

    db.addRoomMember(roomId, userId, username);

    logger.info('Member added to room', { roomId, username });

    return room;
  }

  /**
   * Remove member from room
   */
  removeMember(roomId, username) {
    db.removeRoomMember(roomId, username);
    logger.info('Member removed from room', { roomId, username });
  }

  /**
   * Check if user is room member
   */
  isMember(roomId, username) {
    return db.isRoomMember(roomId, username);
  }

  /**
   * Get room members with their public keys
   */
  getMembers(roomId) {
    const room = db.getRoomById(roomId);

    if (!room) {
      throw new NotFoundError('Room');
    }

    return db.getRoomMembers(roomId);
  }

  /**
   * Get user's rooms
   */
  getUserRooms(username) {
    return db.getUserRooms(username);
  }

  /**
   * Delete room (owner only)
   */
  delete(roomId, username) {
    const room = db.getRoomById(roomId);

    if (!room) {
      throw new NotFoundError('Room');
    }

    if (room.owner_username !== username) {
      throw new AuthorizationError('Only room owner can delete the room');
    }

    db.deleteRoom(roomId);

    logger.info('Room deleted', { roomId, owner: username });

    return { success: true };
  }

  /**
   * Get room messages
   */
  getMessages(roomId, username, limit = 100) {
    if (!db.isRoomMember(roomId, username)) {
      throw new AuthorizationError('Not a room member');
    }

    return db.getRoomMessages(roomId, limit);
  }
}

module.exports = new RoomService();
