/**
 * Logger Utility
 * Provides structured logging with different levels and formats
 */

const config = require('../config');

// Log levels
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

class Logger {
  constructor() {
    this.level = config.env === 'test' ? 'warn' : config.isProduction ? 'info' : 'debug';
  }

  /**
   * Format timestamp
   */
  timestamp() {
    return new Date().toISOString();
  }

  /**
   * Format log message
   */
  format(level, message, meta = {}) {
    const timestamp = this.timestamp();
    const metaString = Object.keys(meta).length > 0 
      ? ` ${JSON.stringify(meta)}` 
      : '';

    if (config.isProduction) {
      // JSON format for production (easier to parse)
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...meta,
      });
    }

    // Pretty format for development
    const colors = {
      error: COLORS.red,
      warn: COLORS.yellow,
      info: COLORS.green,
      debug: COLORS.blue,
    };

    const color = colors[level] || COLORS.reset;
    return `${COLORS.gray}${timestamp}${COLORS.reset} ${color}[${level.toUpperCase()}]${COLORS.reset} ${message}${metaString}`;
  }

  /**
   * Check if should log at this level
   */
  shouldLog(level) {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  /**
   * Log error
   */
  error(message, meta = {}) {
    if (this.shouldLog('error')) {
      console.error(this.format('error', message, meta));
    }
  }

  /**
   * Log warning
   */
  warn(message, meta = {}) {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message, meta));
    }
  }

  /**
   * Log info
   */
  info(message, meta = {}) {
    if (this.shouldLog('info')) {
      console.log(this.format('info', message, meta));
    }
  }

  /**
   * Log debug
   */
  debug(message, meta = {}) {
    if (this.shouldLog('debug')) {
      console.log(this.format('debug', message, meta));
    }
  }

  /**
   * Log HTTP request
   */
  http(req, res, duration) {
    const meta = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    };

    if (res.statusCode >= 400) {
      this.warn('HTTP Request', meta);
    } else {
      this.info('HTTP Request', meta);
    }
  }
}

module.exports = new Logger();
