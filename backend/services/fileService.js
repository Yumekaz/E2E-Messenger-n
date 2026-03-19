/**
 * File Upload Service
 * Handles file upload, validation, and storage with encryption support
 */

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const config = require('../config');
const db = require('../database/db');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../utils/errors');

class FileService {
  constructor() {
    // Ensure upload directory exists
    if (!fs.existsSync(config.upload.directory)) {
      fs.mkdirSync(config.upload.directory, { recursive: true });
    }

    // Configure multer storage
    this.storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, config.upload.directory);
      },
      filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
      },
    });

    // Configure multer upload
    this.upload = multer({
      storage: this.storage,
      limits: {
        fileSize: config.upload.maxFileSize,
      },
      fileFilter: (req, file, cb) => {
        this.validateFile(file, req, cb);
      },
    });
  }

  /**
   * Validate file type
   * Allow encrypted files (application/octet-stream) to pass through
   */
  validateFile(file, req, cb) {
    // If it's an encrypted file, allow it
    if (req.body && req.body.encrypted === 'true') {
      return cb(null, true);
    }

    const extname = config.upload.allowedExtensions.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = config.upload.allowedMimeTypes.includes(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }

    // Also allow encrypted file extension
    if (file.originalname.endsWith('.enc')) {
      return cb(null, true);
    }

    cb(new ValidationError(`Invalid file type. Allowed: ${config.upload.allowedExtensions}`));
  }

  /**
   * Get multer middleware for single file upload
   */
  getUploadMiddleware() {
    return this.upload.single('file');
  }

  /**
   * Save file metadata to database (with encryption support)
   */
  saveFileMetadata(roomId, userId, username, file, encryptionInfo = {}) {
    const { encrypted, iv, metadata } = encryptionInfo;
    const storedFilename = file.originalname;
    const storedMimetype = encrypted ? 'application/octet-stream' : file.mimetype;
    const storedSize = file.size;

    const attachment = db.createAttachment(
      roomId,
      userId,
      username,
      storedFilename,
      file.filename,
      storedMimetype,
      storedSize,
      {
        encrypted: encrypted || false,
        iv: iv || null,
        metadata: metadata || null,
        originalName: null,
        originalType: null,
        originalSize: null,
      }
    );

    logger.info('File uploaded', { 
      attachmentId: attachment.id, 
      roomId, 
      filename: file.originalname,
      encrypted: encrypted || false,
    });

    return {
      id: attachment.id,
      filename: attachment.filename,
      url: `/api/files/${attachment.id}`,
      mimetype: attachment.mimetype,
      size: attachment.size,
      encrypted: encrypted || false,
      iv: iv || null,
      metadata: metadata || null,
    };
  }

  /**
   * Get attachment by ID
   */
  getAttachment(id) {
    const attachment = db.getAttachment(id);

    if (!attachment) {
      throw new NotFoundError('Attachment');
    }

    return attachment;
  }

  /**
   * Get all attachments for a room
   */
  getRoomAttachments(roomId) {
    return db.getRoomAttachments(roomId);
  }

  /**
   * Delete attachment file from disk
   */
  deleteFile(filepath) {
    const fullPath = path.join(config.upload.directory, filepath);
    
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      logger.debug('File deleted', { filepath });
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Check if file is an image
   */
  isImage(mimetype) {
    return mimetype && mimetype.startsWith('image/');
  }
}

module.exports = new FileService();
