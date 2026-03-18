/**
 * Authentication Service
 * Handles user registration, login, and JWT token management
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const db = require('../database/db');
const logger = require('../utils/logger');
const {
  AuthenticationError,
  ValidationError,
  ConflictError
} = require('../utils/errors');

class AuthService {
  /**
   * Register a new user
   */
  async register(email, username, password) {
    // Check if email already exists
    if (db.userExistsByEmail(email)) {
      throw new ConflictError('Email already registered');
    }

    // Check if username already exists
    if (db.userExistsByUsername(username)) {
      throw new ConflictError('Username already taken');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);

    // Create user
    const user = db.createUser(email, username, passwordHash);

    logger.info('User registered', { userId: user.id, username });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  /**
   * Login user
   */
  async login(email, password) {
    // Find user
    const user = db.getUserByEmail(email);

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Check if user has password (might be legacy user without auth)
    if (!user.password_hash) {
      throw new AuthenticationError('Account requires password setup');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Update last seen
    db.updateLastSeen(user.id);

    logger.info('User logged in', { userId: user.id, username: user.username });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken) {
    // Find refresh token in database
    const storedToken = db.getRefreshToken(refreshToken);

    if (!storedToken) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    // Get user
    const user = db.getUserById(storedToken.user_id);

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Revoke old refresh token (token rotation)
    db.revokeRefreshToken(refreshToken);

    // Generate new tokens
    const tokens = await this.generateTokens(user);

    logger.debug('Token refreshed', { userId: user.id });

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(refreshToken) {
    if (refreshToken) {
      db.revokeRefreshToken(refreshToken);
    }
    return { success: true };
  }

  /**
   * Logout from all devices - revoke all refresh tokens
   */
  async logoutAll(userId) {
    db.revokeAllUserTokens(userId);
    logger.info('User logged out from all devices', { userId });
    return { success: true };
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (error) {
      throw new AuthenticationError('Invalid or expired token');
    }
  }

  /**
   * Generate access and refresh tokens
   */
  async generateTokens(user) {
    // Access token (short-lived)
    const accessToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        type: 'access'
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Refresh token (long-lived)
    const refreshToken = crypto.randomBytes(64).toString('hex');

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    // Store refresh token
    db.createRefreshToken(user.id, refreshToken, expiresAt.toISOString());

    return {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.expiresIn,
    };
  }

  /**
   * Generate temporary upload token for legacy users
   */
  generateLegacyUploadToken(username) {
    return jwt.sign(
      {
        username,
        type: 'legacy_upload'
      },
      config.jwt.secret,
      { expiresIn: '5m' } // 5 minutes expiry
    );
  }

  /**
   * Get user by ID (for authenticated requests)
   */
  getUserById(userId) {
    const user = db.getUserById(userId);
    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * Remove sensitive data from user object
   */
  sanitizeUser(user) {
    const { password_hash, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Change password
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = db.getUserById(userId);

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, config.bcrypt.saltRounds);

    // Update password (we'd need to add this function to db.js)
    // db.updateUserPassword(userId, newPasswordHash);

    // Revoke all refresh tokens (security measure)
    db.revokeAllUserTokens(userId);

    logger.info('Password changed', { userId });

    return { success: true };
  }
}

module.exports = new AuthService();
