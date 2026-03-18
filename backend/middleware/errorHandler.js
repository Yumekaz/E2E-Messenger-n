/**
 * Error Handler Middleware
 * Centralizes error handling for all routes
 */

const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

/**
 * Handle 404 Not Found
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  logger.error(err.message, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    userId: req.user?.userId,
  });

  // Handle known operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details && { details: err.details }),
    });
  }

  // Handle Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'FILE_TOO_LARGE',
      message: `File size exceeds limit of ${config.upload.maxFileSize / (1024 * 1024)}MB`,
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'INVALID_FIELD',
      message: 'Unexpected file field',
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Invalid token',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'TOKEN_EXPIRED',
      message: 'Token has expired',
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: err.message,
    });
  }

  // Handle unknown errors
  const statusCode = err.statusCode || 500;
  const message = config.isProduction
    ? 'Internal server error'
    : err.message || 'Internal server error';

  res.status(statusCode).json({
    error: 'INTERNAL_ERROR',
    message,
    ...(config.isProduction ? {} : { stack: err.stack }),
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
