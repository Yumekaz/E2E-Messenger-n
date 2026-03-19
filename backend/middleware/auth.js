/**
 * Authentication Middleware
 * Verifies JWT tokens for protected routes
 */

const authService = require('../services/authService');
const { AuthenticationError } = require('../utils/errors');

/**
 * Authenticate access token from Authorization header
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return next(new AuthenticationError('Access token required'));
  }

  try {
    const decoded = authService.verifyAccessToken(token);

    // Handle legacy upload tokens
    if (decoded.type === 'legacy_upload') {
      req.user = {
        userId: null,
        username: decoded.username,
        type: 'legacy'
      };
    } else {
      req.user = decoded; // { userId, username, type }
    }

    next();
  } catch (error) {
    next(new AuthenticationError('Invalid or expired token'));
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = authService.verifyAccessToken(token);
      req.user = decoded;
    } catch (error) {
      // Token invalid, but that's okay for optional auth
      req.user = null;
    }
  } else {
    req.user = null;
  }

  next();
}

/**
 * Authenticate Socket.IO connection
 */
function authenticateSocket(socket, next) {
  const token = socket.handshake.auth.token;
  socket.authInvalid = false;

  if (!token) {
    // Allow unauthenticated connections for backward compatibility
    // They'll use the legacy username-only flow
    socket.user = null;
    return next();
  }

  try {
    const decoded = authService.verifyAccessToken(token);
    socket.user = decoded;
    next();
  } catch (error) {
    // Allow the socket to connect so the client can refresh or clear state,
    // but do not silently treat a bad auth token as an intentional legacy session.
    socket.user = null;
    socket.authInvalid = true;
    next();
  }
}

module.exports = {
  authenticateToken,
  optionalAuth,
  authenticateSocket,
};
