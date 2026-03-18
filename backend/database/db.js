/**
 * Database Module - Enhanced SQLite Persistence Layer
 * 
 * Features:
 * - User authentication (email, password hash)
 * - Refresh tokens for JWT rotation
 * - File attachments support
 * - Message state machine (pending → delivered → read)
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

const DB_PATH = config.database.path;

// Message state constants
const MessageState = {
  PENDING: 'pending',
  DELIVERED: 'delivered',
  READ: 'read',
};

// Database instance
let db = null;
let SQL = null;
let saveInterval = null;

/**
 * Save database to file
 */
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, buffer);
  }
}

/**
 * Initialize database
 */
async function initializeDatabase() {
  SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    logger.info('Loaded existing database');
  } else {
    db = new SQL.Database();
    logger.info('Created new database');
  }

  // Create schema with new auth tables
  db.run(`
    -- Users table with authentication
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      public_key TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now'))
    );

    -- Refresh tokens for JWT rotation
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      revoked_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Rooms table
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT UNIQUE NOT NULL,
      room_code TEXT NOT NULL,
      owner_id INTEGER,
      owner_username TEXT NOT NULL,
      room_type TEXT DEFAULT 'legacy' CHECK(room_type IN ('legacy', 'authenticated')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Room members
    CREATE TABLE IF NOT EXISTS room_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      user_id INTEGER,
      username TEXT NOT NULL,
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(room_id, username)
    );

    -- Messages with attachment support
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE NOT NULL,
      room_id TEXT NOT NULL,
      sender_id INTEGER,
      sender_username TEXT NOT NULL,
      encrypted_data TEXT NOT NULL,
      iv TEXT NOT NULL,
      attachment_id INTEGER,
      state TEXT DEFAULT 'pending' CHECK(state IN ('pending', 'delivered', 'read')),
      created_at TEXT DEFAULT (datetime('now')),
      delivered_at TEXT,
      read_at TEXT,
      FOREIGN KEY(attachment_id) REFERENCES attachments(id)
    );

    -- File attachments with encryption support
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      user_id INTEGER,
      username TEXT NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      mimetype TEXT,
      size INTEGER,
      encrypted BOOLEAN DEFAULT FALSE,
      iv TEXT,
      metadata TEXT,
      original_name TEXT,
      original_type TEXT,
      original_size INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
    CREATE INDEX IF NOT EXISTS idx_messages_state ON messages(state);
    CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id);
    CREATE INDEX IF NOT EXISTS idx_room_code ON rooms(room_code);
    CREATE INDEX IF NOT EXISTS idx_attachments_room ON attachments(room_id);
  `);

  saveDatabase();
  saveInterval = setInterval(saveDatabase, 30000);

  logger.info('Database initialized with authentication support');
  return db;
}

// ==================== HELPERS ====================

function runQuery(sql, params = []) {
  db.run(sql, params);
  const lastId = getLastInsertRowId();
  const changes = db.getRowsModified();

  // Only save if changes were made
  if (changes > 0) {
    saveDatabase();
  }

  return { changes, lastInsertRowid: lastId };
}

function getLastInsertRowId() {
  const result = db.exec('SELECT last_insert_rowid() as id');
  return result[0]?.values[0]?.[0];
}

function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// ==================== USER OPERATIONS ====================

function createUser(email, username, passwordHash) {
  const result = runQuery(
    `INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)`,
    [email, username, passwordHash]
  );
  return { id: result.lastInsertRowid, email, username };
}

function getUserByEmail(email) {
  return getOne('SELECT * FROM users WHERE email = ?', [email]);
}

function getUserById(id) {
  return getOne('SELECT * FROM users WHERE id = ?', [id]);
}

function getUserByUsername(username) {
  return getOne('SELECT * FROM users WHERE username = ?', [username]);
}

function userExistsByEmail(email) {
  return getOne('SELECT 1 FROM users WHERE email = ?', [email]) !== undefined;
}

function userExistsByUsername(username) {
  return getOne('SELECT 1 FROM users WHERE username = ?', [username]) !== undefined;
}

function updateUserPublicKey(userId, publicKey) {
  return runQuery(
    `UPDATE users SET public_key = ?, last_seen = datetime('now') WHERE id = ?`,
    [publicKey, userId]
  );
}

function upsertUser(username, publicKey) {
  const existing = getOne('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    return runQuery(
      `UPDATE users SET public_key = ?, last_seen = datetime('now') WHERE username = ?`,
      [publicKey, username]
    );
  } else {
    return runQuery(
      `INSERT INTO users (username, public_key) VALUES (?, ?)`,
      [username, publicKey]
    );
  }
}

function updateLastSeen(userId) {
  return runQuery(`UPDATE users SET last_seen = datetime('now') WHERE id = ?`, [userId]);
}

// ==================== REFRESH TOKEN OPERATIONS ====================

function createRefreshToken(userId, token, expiresAt) {
  return runQuery(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
    [userId, token, expiresAt]
  );
}

function getRefreshToken(token) {
  return getOne(
    `SELECT * FROM refresh_tokens WHERE token = ? AND revoked_at IS NULL AND expires_at > datetime('now')`,
    [token]
  );
}

function revokeRefreshToken(token) {
  return runQuery(
    `UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token = ?`,
    [token]
  );
}

function revokeAllUserTokens(userId) {
  return runQuery(
    `UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ?`,
    [userId]
  );
}

function cleanupExpiredTokens() {
  return runQuery(
    `DELETE FROM refresh_tokens WHERE expires_at < datetime('now')`
  );
}

// ==================== ROOM OPERATIONS ====================

function createRoom(roomId, roomCode, ownerId, ownerUsername, roomType = 'legacy') {
  runQuery(
    `INSERT INTO rooms (room_id, room_code, owner_id, owner_username, room_type) VALUES (?, ?, ?, ?, ?)`,
    [roomId, roomCode, ownerId, ownerUsername, roomType]
  );
  runQuery(
    `INSERT INTO room_members (room_id, user_id, username) VALUES (?, ?, ?)`,
    [roomId, ownerId, ownerUsername]
  );
  return { roomId, roomCode, ownerId, ownerUsername, roomType };
}

function getRoomByCode(roomCode) {
  return getOne('SELECT * FROM rooms WHERE room_code = ?', [roomCode]);
}

function getRoomById(roomId) {
  return getOne('SELECT * FROM rooms WHERE room_id = ?', [roomId]);
}

function addRoomMember(roomId, userId, username) {
  const existing = getOne(
    'SELECT 1 FROM room_members WHERE room_id = ? AND username = ?',
    [roomId, username]
  );
  if (!existing) {
    return runQuery(
      `INSERT INTO room_members (room_id, user_id, username) VALUES (?, ?, ?)`,
      [roomId, userId, username]
    );
  }
  return { changes: 0 };
}

function removeRoomMember(roomId, username) {
  return runQuery(
    'DELETE FROM room_members WHERE room_id = ? AND username = ?',
    [roomId, username]
  );
}

function isRoomMember(roomId, username) {
  return getOne(
    'SELECT 1 FROM room_members WHERE room_id = ? AND username = ?',
    [roomId, username]
  ) !== undefined;
}

function getRoomMembers(roomId) {
  return getAll(`
    SELECT rm.username, u.public_key, u.id as user_id
    FROM room_members rm
    LEFT JOIN users u ON rm.username = u.username
    WHERE rm.room_id = ?
  `, [roomId]);
}

function getUserRooms(username) {
  return getAll(`
    SELECT r.room_id, r.room_code, r.owner_username
    FROM rooms r
    JOIN room_members rm ON r.room_id = rm.room_id
    WHERE rm.username = ?
  `, [username]);
}

function deleteRoom(roomId) {
  runQuery('DELETE FROM attachments WHERE room_id = ?', [roomId]);
  runQuery('DELETE FROM messages WHERE room_id = ?', [roomId]);
  runQuery('DELETE FROM room_members WHERE room_id = ?', [roomId]);
  return runQuery('DELETE FROM rooms WHERE room_id = ?', [roomId]);
}

// ==================== MESSAGE OPERATIONS ====================

function storeMessage(messageId, roomId, senderId, senderUsername, encryptedData, iv, attachmentId = null) {
  return runQuery(
    `INSERT INTO messages (message_id, room_id, sender_id, sender_username, encrypted_data, iv, attachment_id, state)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [messageId, roomId, senderId, senderUsername, encryptedData, iv, attachmentId]
  );
}

function getRoomMessages(roomId, limit = 100) {
  return getAll(`
    SELECT m.message_id, m.room_id, m.sender_username, m.encrypted_data, m.iv, 
           m.state, m.created_at, m.attachment_id,
           a.filename, a.filepath, a.mimetype, a.size,
           a.encrypted, a.iv as attachment_iv, a.metadata, 
           a.original_name, a.original_type, a.original_size
    FROM messages m
    LEFT JOIN attachments a ON m.attachment_id = a.id
    WHERE m.room_id = ?
    ORDER BY m.created_at ASC
    LIMIT ?
  `, [roomId, limit]);
}

function markMessageDelivered(messageId, recipientUsername) {
  return runQuery(`
    UPDATE messages
    SET state = 'delivered', delivered_at = datetime('now')
    WHERE message_id = ? AND state = 'pending' AND sender_username != ?
  `, [messageId, recipientUsername]);
}

function markMessageRead(messageId, recipientUsername) {
  return runQuery(`
    UPDATE messages
    SET state = 'read', read_at = datetime('now')
    WHERE message_id = ? AND state IN ('pending', 'delivered') AND sender_username != ?
  `, [messageId, recipientUsername]);
}

// ==================== ATTACHMENT OPERATIONS ====================

function createAttachment(roomId, userId, username, filename, filepath, mimetype, size, encryptionInfo = {}) {
  const { encrypted, iv, metadata, originalName, originalType, originalSize } = encryptionInfo;

  const result = runQuery(
    `INSERT INTO attachments (room_id, user_id, username, filename, filepath, mimetype, size, encrypted, iv, metadata, original_name, original_type, original_size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [roomId, userId, username, filename, filepath, mimetype, size, encrypted ? 1 : 0, iv, metadata, originalName, originalType, originalSize]
  );
  return {
    id: result.lastInsertRowid,
    roomId,
    filename,
    filepath,
    mimetype,
    size,
    encrypted: encrypted || false,
    iv: iv || null,
    metadata: metadata || null,
    original_name: originalName || null,
    original_type: originalType || null,
    original_size: originalSize || null,
  };
}

function getAttachment(id) {
  return getOne('SELECT * FROM attachments WHERE id = ?', [id]);
}

function getRoomAttachments(roomId) {
  return getAll('SELECT * FROM attachments WHERE room_id = ? ORDER BY created_at DESC', [roomId]);
}

// ==================== STATISTICS ====================

function getStats() {
  const userCount = getOne('SELECT COUNT(*) as count FROM users') || { count: 0 };
  const roomCount = getOne('SELECT COUNT(*) as count FROM rooms') || { count: 0 };
  const messageCount = getOne('SELECT COUNT(*) as count FROM messages') || { count: 0 };
  const attachmentCount = getOne('SELECT COUNT(*) as count FROM attachments') || { count: 0 };

  return {
    users: userCount.count,
    rooms: roomCount.count,
    messages: messageCount.count,
    attachments: attachmentCount.count,
  };
}

// ==================== CLEANUP ====================

function close() {
  if (saveInterval) {
    clearInterval(saveInterval);
  }
  if (db) {
    saveDatabase();
    db.close();
  }
  logger.info('Database connection closed');
}

module.exports = {
  // Initialization
  initializeDatabase,

  // Constants
  MessageState,

  // User operations
  createUser,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  userExistsByEmail,
  userExistsByUsername,
  updateUserPublicKey,
  upsertUser,
  updateLastSeen,

  // Refresh token operations
  createRefreshToken,
  getRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  cleanupExpiredTokens,

  // Room operations
  createRoom,
  getRoomByCode,
  getRoomById,
  addRoomMember,
  removeRoomMember,
  isRoomMember,
  getRoomMembers,
  getUserRooms,
  deleteRoom,

  // Message operations
  storeMessage,
  getRoomMessages,
  markMessageDelivered,
  markMessageRead,

  // Attachment operations
  createAttachment,
  getAttachment,
  getRoomAttachments,

  // Utilities
  getStats,
  close,
  saveDatabase,
};
