/**
 * Rate Limiter Middleware
 * Prevents brute force attacks and API abuse
 */

const config = require('../config');
const { RateLimitError } = require('../utils/errors');

// Simple in-memory rate limiter
// For production, consider using Redis
class RateLimiter {
  constructor() {
    this.requests = new Map();
    
    // Cleanup old entries every minute
    this.cleanupTimer = setInterval(() => this.cleanup(), 60000);
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Check if request should be rate limited
   */
  check(key, maxRequests, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create request history for this key
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }

    const requestHistory = this.requests.get(key);

    // Remove old requests outside the window
    const recentRequests = requestHistory.filter(time => time > windowStart);
    
    // Update stored requests
    this.requests.set(key, recentRequests);

    // Check if limit exceeded
    if (recentRequests.length >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: Math.ceil((recentRequests[0] + windowMs - now) / 1000),
      };
    }

    // Add current request
    recentRequests.push(now);

    return {
      allowed: true,
      remaining: maxRequests - recentRequests.length,
      resetTime: Math.ceil(windowMs / 1000),
    };
  }

  /**
   * Cleanup old entries
   */
  cleanup() {
    const now = Date.now();
    const maxAge = config.rateLimit.windowMs * 2;

    for (const [key, requests] of this.requests.entries()) {
      const validRequests = requests.filter(time => now - time < maxAge);
      
      if (validRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validRequests);
      }
    }
  }
}

const limiter = new RateLimiter();

/**
 * Create rate limiter middleware
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = config.rateLimit.windowMs,
    maxRequests = config.rateLimit.maxRequests,
    keyGenerator = (req) => req.ip,
    message = 'Too many requests, please try again later',
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const result = limiter.check(key, maxRequests, windowMs);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetTime);

    if (!result.allowed) {
      res.setHeader('Retry-After', result.resetTime);
      return next(new RateLimitError(message));
    }

    next();
  };
}

/**
 * Rate limiter for authentication routes (stricter)
 */
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: config.rateLimit.authMaxRequests, // 5 attempts
  message: 'Too many login attempts, please try again in 15 minutes',
});

/**
 * General API rate limiter
 */
const apiRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  maxRequests: config.rateLimit.maxRequests,
});

module.exports = {
  createRateLimiter,
  authRateLimiter,
  apiRateLimiter,
};
