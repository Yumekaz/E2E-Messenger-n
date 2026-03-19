const express = require('express');
const path = require('path');
const cors = require('cors');

const requestLogger = require('../middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('../middleware/errorHandler');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { authRoutes, roomRoutes, fileRoutes } = require('../routes');
const { buildNetworkInfo } = require('../utils/networkInfo');
const { evaluateLocalNetworkAccess } = require('../utils/localNetwork');

const PUBLIC_BUILD_DIR = path.resolve(__dirname, '..', '..', 'public_build');

function createApiRateLimiter() {
  return (req, res, next) => {
    if (req.path.startsWith('/files/') && req.method === 'GET') {
      return next();
    }

    return apiRateLimiter(req, res, next);
  };
}

function buildAllowedHosts(config, httpsPort, httpsEnabled) {
  const networkInfo = buildNetworkInfo(config.port, httpsPort, httpsEnabled);
  const candidateHosts = new Set(['127.0.0.1', 'localhost']);

  for (const candidate of networkInfo.candidates || []) {
    candidateHosts.add(candidate.ip);
  }

  return candidateHosts;
}

function isAllowedOrigin(origin, allowedHosts) {
  if (!origin) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    return allowedHosts.has(parsed.hostname);
  } catch (error) {
    return false;
  }
}

function createLocalNetworkGuard(config) {
  return (req, res, next) => {
    if (!config.network.localOnly) {
      next();
      return;
    }

    const remoteAddress = config.network.trustProxy ? req.ip : req.socket.remoteAddress;
    const access = evaluateLocalNetworkAccess(remoteAddress);
    if (access.allowed) {
      next();
      return;
    }

    if (req.path.startsWith('/api')) {
      res.status(403).json({
        message: 'Local network access only. Connect from the same Wi-Fi, hotspot, or LAN.',
      });
      return;
    }

    res
      .status(403)
      .type('text/plain')
      .send('Local network access only. Connect from the same Wi-Fi, hotspot, or LAN.');
  };
}

function createApp({ config, db, httpsPort, isHttpsEnabled }) {
  const app = express();
  const allowedHosts = buildAllowedHosts(config, httpsPort, isHttpsEnabled());

  app.set('trust proxy', config.network.trustProxy);

  app.use(
    cors({
      origin(origin, callback) {
        callback(null, isAllowedOrigin(origin, allowedHosts));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: false,
    })
  );

  app.use(createLocalNetworkGuard(config));
  app.use(requestLogger);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      stats: db.getStats(),
    });
  });

  app.get('/api/network-info', (req, res) => {
    res.json(buildNetworkInfo(config.port, httpsPort, isHttpsEnabled()));
  });

  app.use('/api', createApiRateLimiter());

  app.use(express.static(PUBLIC_BUILD_DIR));

  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/files', fileRoutes);

  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(PUBLIC_BUILD_DIR, 'index.html'));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
