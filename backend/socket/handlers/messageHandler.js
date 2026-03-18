/**
 * Message Socket Handler
 * Handles real-time message events
 */

const crypto = require('crypto');
const db = require('../../database/db');
const logger = require('../../utils/logger');
const { serializeAttachmentRecord } = require('../../utils/messagePayloads');

function createMessageHandler(io, socket, state) {
  const { users } = state;

  /**
   * Send encrypted message
   */
  socket.on('send-encrypted-message', ({ roomId, encryptedData, iv, senderUsername, attachmentId }) => {
    const user = users.get(socket.id);
    if (!user) {
      socket.emit('error', { message: 'Not registered' });
      return;
    }

    // Check room and membership via database
    const dbRoom = db.getRoomById(roomId);
    if (!dbRoom) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (!db.isRoomMember(roomId, user.username)) {
      socket.emit('error', { message: 'Cannot send message' });
      return;
    }

    const messageId = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();

    // Fetch attachment details if provided
    let attachment = null;
    if (attachmentId) {
      const dbAttachment = db.getAttachment(attachmentId);
      if (dbAttachment) {
        attachment = serializeAttachmentRecord(dbAttachment);
      }
    }

    const message = {
      id: messageId,
      encryptedData,
      iv,
      senderUsername: user.username,
      timestamp,
      attachment
    };

    // Store in database
    db.storeMessage(
      messageId,
      roomId,
      user.id || null,
      user.username,
      encryptedData,
      iv,
      attachmentId || null
    );

    // Broadcast to room
    io.to(roomId).emit('new-encrypted-message', message);

    logger.debug('Message sent', { roomId, sender: user.username, hasAttachment: !!attachmentId });
  });

  /**
   * Mark message as delivered
   */
  socket.on('message-delivered', ({ messageId }) => {
    const user = users.get(socket.id);
    if (user) {
      db.markMessageDelivered(messageId, user.username);
    }
  });

  /**
   * Mark message as read
   */
  socket.on('message-read', ({ messageId }) => {
    const user = users.get(socket.id);
    if (user) {
      db.markMessageRead(messageId, user.username);
    }
  });

  /**
   * Typing indicator
   */
  socket.on('typing', ({ roomId }) => {
    const user = users.get(socket.id);
    if (!user) return;

    // Check membership via database
    if (db.isRoomMember(roomId, user.username)) {
      socket.to(roomId).emit('user-typing', { username: user.username });
    }
  });
}

module.exports = createMessageHandler;
