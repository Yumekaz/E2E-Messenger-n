/**
 * File Controller
 * Handles file upload requests with encryption support
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const fileService = require('../services/fileService');
const roomService = require('../services/roomService');
const logger = require('../utils/logger');
const { ValidationError, AuthorizationError, NotFoundError } = require('../utils/errors');

class FileController {
  /**
   * POST /api/files/upload
   * Upload a file (plain or encrypted)
   */
  async upload(req, res, next) {
    const forwardUploadError = (error) => {
      if (req.readableEnded || req.complete) {
        next(error);
        return;
      }

      let settled = false;
      const finalize = () => {
        if (settled) {
          return;
        }

        settled = true;
        req.off('end', finalize);
        req.off('close', finalize);
        req.off('error', finalize);
        next(error);
      };

      req.on('end', finalize);
      req.on('close', finalize);
      req.on('error', finalize);
      req.resume();
    };

    // Use multer middleware
    fileService.getUploadMiddleware()(req, res, async (err) => {
      if (err) {
        forwardUploadError(err);
        return;
      }

      try {
        if (!req.file) {
          throw new ValidationError('No file uploaded');
        }

        const { roomId, encrypted, iv, metadata } = req.body;

        if (!roomId) {
          throw new ValidationError('Room ID is required');
        }

        // Verify user is a room member
        if (!roomService.isMember(roomId, req.user.username)) {
          throw new AuthorizationError('Not a room member');
        }

        // Save file metadata with encryption info
        const attachment = fileService.saveFileMetadata(
          roomId,
          req.user.userId,
          req.user.username,
          req.file,
          {
            encrypted: encrypted === 'true',
            iv: iv || null,
            metadata: metadata || null,
          }
        );

        res.status(201).json({
          message: 'File uploaded successfully',
          attachment,
        });
      } catch (error) {
        // Clean up uploaded file if error occurs
        if (req.file) {
          fileService.deleteFile(req.file.filename);
        }
        next(error);
      }
    });
  }

  /**
   * GET /api/files/:id
   * Get file metadata
   */
  async getFile(req, res, next) {
    try {
      const { id } = req.params;
      const attachment = fileService.getAttachment(parseInt(id));

      // Verify user is a room member
      if (!roomService.isMember(attachment.room_id, req.user.username)) {
        throw new AuthorizationError('Not a room member');
      }

      // Serve the specific file
      const absolutePath = path.resolve(config.upload.directory, attachment.filepath);

      // Check if file exists
      if (!fs.existsSync(absolutePath)) {
        throw new NotFoundError('File not found on server');
      }

      // Set correct mimetype
      // If encrypted, sending as application/octet-stream is correct
      // If plain, use stored mimetype
      res.setHeader('Content-Type', attachment.mimetype);
      res.setHeader('Content-Disposition', `inline; filename="${attachment.filename}"`);

      const stream = fs.createReadStream(absolutePath);
      stream.on('error', (err) => {
        logger.error('File stream error', {
          attachmentId: attachment.id,
          filepath: absolutePath,
          error: err.message,
        });
        if (!res.headersSent) res.status(500).json({ message: 'Error streaming file' });
      });
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/files/room/:roomId
   * Get all files in a room
   */
  async getRoomFiles(req, res, next) {
    try {
      const { roomId } = req.params;

      // Verify user is a room member
      if (!roomService.isMember(roomId, req.user.username)) {
        throw new AuthorizationError('Not a room member');
      }

      const attachments = fileService.getRoomAttachments(roomId);

      res.json({
        attachments: attachments.map(a => ({
          id: a.id,
          filename: a.filename,
          url: `/api/files/${a.id}`,
          mimetype: a.mimetype,
          size: a.size,
          uploadedBy: a.username,
          createdAt: a.created_at,
          isImage: fileService.isImage(a.mimetype),
          encrypted: a.encrypted || false,
          iv: a.iv || null,
          metadata: a.metadata || null,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FileController();
