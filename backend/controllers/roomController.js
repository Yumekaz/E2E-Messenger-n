/**
 * Room Controller
 * Handles HTTP requests for room management
 */

const roomService = require('../services/roomService');

class RoomController {
  /**
   * POST /api/rooms
   * Create a new room
   */
  async create(req, res, next) {
    try {
      const roomType = req.user.userId ? 'authenticated' : 'legacy';
      const room = roomService.create(req.user.userId, req.user.username, roomType);

      res.status(201).json({
        message: 'Room created',
        room: {
          roomId: room.roomId,
          roomCode: room.roomCode,
          isOwner: true,
          roomType,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/rooms/:roomCode
   * Get room info by code
   */
  async getByCode(req, res, next) {
    try {
      const { roomCode } = req.params;
      const room = roomService.getByCode(roomCode);
      const members = roomService.getMembers(room.room_id);

      res.json({
        room: {
          roomId: room.room_id,
          roomCode: room.room_code,
          owner: room.owner_username,
          memberCount: members.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/rooms/:roomId/members
   * Get room members
   */
  async getMembers(req, res, next) {
    try {
      const { roomId } = req.params;
      
      // Check if user is a member
      if (!roomService.isMember(roomId, req.user.username)) {
        return res.status(403).json({ error: 'Not a room member' });
      }

      const members = roomService.getMembers(roomId);

      res.json({
        members: members.map(m => ({
          username: m.username,
          publicKey: m.public_key,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/rooms/my-rooms
   * Get user's rooms
   */
  async getMyRooms(req, res, next) {
    try {
      const rooms = roomService.getUserRooms(req.user.username);

      res.json({
        rooms: rooms.map(r => ({
          roomId: r.room_id,
          roomCode: r.room_code,
          isOwner: r.owner_username === req.user.username,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/rooms/:roomId
   * Delete a room (owner only)
   */
  async delete(req, res, next) {
    try {
      const { roomId } = req.params;

      await roomService.delete(roomId, req.user.username);

      res.json({ message: 'Room deleted' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/rooms/:roomId/messages
   * Get room messages
   */
  async getMessages(req, res, next) {
    try {
      const { roomId } = req.params;
      const limit = parseInt(req.query.limit) || 100;

      const messages = roomService.getMessages(roomId, req.user.username, limit);

      res.json({
        messages: messages.map(m => ({
          messageId: m.message_id,
          senderUsername: m.sender_username,
          encryptedData: m.encrypted_data,
          iv: m.iv,
          state: m.state,
          createdAt: m.created_at,
          attachment: m.attachment_id ? {
            id: m.attachment_id,
            filename: m.filename,
            url: `/api/files/${m.attachment_id}`,
            mimetype: m.mimetype,
            size: m.size,
          } : null,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RoomController();
