/**
 * E2E Encrypted Messenger Server
 * 
 * A secure, real-time messaging application with:
 * - End-to-end encryption (AES-256-GCM + ECDH)
 * - JWT authentication with refresh tokens
 * - File upload support
 * - SQLite persistence
 * 
 * @author Your Name
 * @version 3.0.0
 */

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

// SSL certificate paths
const SSL_KEY_PATH = path.join(__dirname, 'ssl', 'key.pem');
const SSL_CERT_PATH = path.join(__dirname, 'ssl', 'cert.pem');
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT, 10) || 3443;
const DISABLE_HTTPS = process.env.DISABLE_HTTPS === 'true';

// Load environment variables first
require('dotenv').config();

// Import configuration and utilities
const config = require('./backend/config');
const logger = require('./backend/utils/logger');
const db = require('./backend/database/db');
const { buildNetworkInfo, getPreferredLocalIp } = require('./backend/utils/networkInfo');

// Import middleware
const requestLogger = require('./backend/middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./backend/middleware/errorHandler');
const { apiRateLimiter } = require('./backend/middleware/rateLimiter');

// Import routes
const { authRoutes, roomRoutes, fileRoutes } = require('./backend/routes');

// Import socket setup
const setupSocketHandlers = require('./backend/socket');

// ==================== APPLICATION SETUP ====================

const app = express();
const server = http.createServer(app);

// Create HTTPS server if certificates exist
let httpsServer = null;
const hasSSL = !DISABLE_HTTPS && fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH);
if (hasSSL) {
  try {
    const sslOptions = {
      key: fs.readFileSync(SSL_KEY_PATH),
      cert: fs.readFileSync(SSL_CERT_PATH),
    };
    httpsServer = https.createServer(sslOptions, app);
  } catch (err) {
    console.error('Failed to load SSL certificates:', err.message);
  }
}

// Create a SINGLE Socket.IO instance that will listen on BOTH servers
const io = new Server({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Attach Socket.IO to HTTP server
io.attach(server);

// Attach Socket.IO to HTTPS server (same io instance!)
if (httpsServer) {
  io.attach(httpsServer);
}

// ==================== MIDDLEWARE ====================

// CORS - Allow all origins in development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Request logging
app.use(requestLogger);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==================== PUBLIC API ROUTES (No rate limiting) ====================

// Health check
app.get('/api/health', (req, res) => {
  const stats = db.getStats();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    stats,
  });
});

// Network info for QR codes (must be accessible without rate limiting)
app.get('/api/network-info', (req, res) => {
  res.json(buildNetworkInfo(config.port, HTTPS_PORT, Boolean(httpsServer)));
});

// Rate limiting for API routes (except file downloads)
// File downloads are excluded because multiple images can load simultaneously
app.use('/api', (req, res, next) => {
  // Skip rate limiting for file GET requests (downloads)
  if (req.path.startsWith('/files/') && req.method === 'GET') {
    return next();
  }
  return apiRateLimiter(req, res, next);
});

// ==================== STATIC FILES ====================

// Uploaded files now served via authenticated /api/files/:id endpoint
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend build
app.use(express.static(path.join(__dirname, 'public_build')));

// ==================== PROTECTED API ROUTES ====================

// Mount route modules (file downloads excluded from rate limiting above)
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/files', fileRoutes);

// Serve frontend for all non-API routes (SPA support)
app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public_build', 'index.html'));
});

// ==================== ERROR HANDLING ====================

app.use(notFoundHandler);
app.use(errorHandler);

// ==================== SERVER STARTUP ====================

async function startServer() {
  try {
    // Initialize database
    await db.initializeDatabase();

    // Setup Socket.IO handlers (single shared io instance for both HTTP and HTTPS)
    setupSocketHandlers(io);

    // Get local IP for display
    const localIP = getPreferredLocalIp();

    // Start HTTP server
    server.listen(config.port, () => {
      logger.info('HTTP server started', { port: config.port, env: config.env });
    });

    // Start HTTPS server if it was created
    if (httpsServer) {
      httpsServer.listen(HTTPS_PORT, () => {
        logger.info('HTTPS server started', { port: HTTPS_PORT });
      });
    }

    // Print banner after a short delay to ensure servers are up
    setTimeout(() => {
      const httpsInfo = httpsServer ? `\n║   📱 HTTPS (Mobile): https://${localIP}:${HTTPS_PORT}`.padEnd(72) + '║' : '';
      const banner = `
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   🔐 E2E ENCRYPTED MESSENGER SERVER v3.0                             ║
║                                                                      ║
║   Environment: ${config.env.padEnd(51)}║
║   🖥️  HTTP:  http://${localIP}:${config.port}`.padEnd(72) + `║${httpsInfo}
║                                                                      ║
║   ⚠️  For mobile access, use HTTPS URL and accept the certificate    ║
║      (Tap "Advanced" → "Proceed anyway")                             ║
║                                                                      ║
║   Features:                                                          ║
║   • End-to-end encryption (AES-256-GCM + ECDH P-256)                 ║
║   • JWT authentication with refresh tokens                           ║
║   • File upload support (images, documents)                          ║
║   • SQLite persistence                                               ║
║   • Rate limiting                                                    ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
      `;
      console.log(banner);
    }, 500);
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  db.close();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal');
  db.close();
  server.close(() => {
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

// Start the server
startServer();
