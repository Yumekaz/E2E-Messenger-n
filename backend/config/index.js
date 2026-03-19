/**
 * Application Configuration
 * Centralizes all environment variables and configuration settings
 */

require('dotenv').config();

const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST_BIND || '0.0.0.0',
  isProduction: process.env.NODE_ENV === 'production',

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Database
  database: {
    path: process.env.DATABASE_PATH || './messenger.db',
  },

  // File Upload
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024, // 10MB
    directory: process.env.UPLOAD_DIR || './uploads',
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    allowedExtensions: /jpeg|jpg|png|gif|webp|pdf|txt|doc|docx/,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 5,
  },

  network: {
    localOnly: process.env.LOCAL_NETWORK_ONLY !== 'false',
    trustProxy: process.env.TRUST_PROXY === 'true',
  },

  // Bcrypt
  bcrypt: {
    saltRounds: 12,
  },
};

// Validate critical config in production
if (config.isProduction) {
  if (config.jwt.secret === 'fallback-secret-change-me') {
    console.error('FATAL: JWT_SECRET must be set in production!');
    process.exit(1);
  }
}

module.exports = config;
