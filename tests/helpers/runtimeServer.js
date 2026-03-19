const fs = require('fs');
const os = require('os');
const path = require('path');

const { findFreePort, waitForServer } = require('./testServer');

let runtime = null;

function resetBackendModules() {
  const backendRoot = path.resolve(__dirname, '..', '..', 'backend');
  const rootFiles = [
    path.resolve(__dirname, '..', '..', 'server-enhanced.js'),
  ];

  for (const cacheKey of Object.keys(require.cache)) {
    if (cacheKey.startsWith(backendRoot) || rootFiles.includes(cacheKey)) {
      delete require.cache[cacheKey];
    }
  }
}

async function startRuntimeServer() {
  if (runtime) {
    return runtime;
  }

  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-messenger-tests-'));
  const databasePath = path.join(runtimeDir, 'messenger.db');
  const uploadDir = path.join(runtimeDir, 'uploads');
  const port = await findFreePort();
  const apiUrl = `http://127.0.0.1:${port}`;

  process.env.NODE_ENV = 'test';
  process.env.PORT = String(port);
  process.env.DISABLE_HTTPS = 'true';
  process.env.DATABASE_PATH = databasePath;
  process.env.UPLOAD_DIR = uploadDir;
  process.env.TEST_API_URL = apiUrl;

  resetBackendModules();

  const config = require('../../backend/config');
  const logger = require('../../backend/utils/logger');
  const db = require('../../backend/database/db');
  const setupSocketHandlers = require('../../backend/socket');
  const createApp = require('../../backend/app/createApp');
  const { createServerBundle } = require('../../backend/server/createServerBundle');

  await db.initializeDatabase();

  const app = createApp({
    config,
    db,
    httpsPort: 3443,
    isHttpsEnabled: () => false,
  });

  const { server, io } = createServerBundle(app, logger, { disableHttps: true });
  setupSocketHandlers(io);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  await waitForServer(apiUrl);

  runtime = {
    apiUrl,
    databasePath,
    db,
    io,
    runtimeDir,
    server,
    uploadDir,
  };

  return runtime;
}

async function stopRuntimeServer() {
  if (!runtime) {
    return;
  }

  const { db, io, runtimeDir, server } = runtime;

  await new Promise((resolve) => {
    io.close(() => resolve());
  });

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && error.code === 'ERR_SERVER_NOT_RUNNING') {
        resolve();
        return;
      }

      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  db.close();
  fs.rmSync(runtimeDir, { recursive: true, force: true });

  runtime = null;

  delete process.env.TEST_API_URL;
  delete process.env.PORT;
  delete process.env.DATABASE_PATH;
  delete process.env.UPLOAD_DIR;
  delete process.env.DISABLE_HTTPS;
}

function getApiUrl() {
  if (!process.env.TEST_API_URL) {
    throw new Error('Test API URL is not initialized');
  }

  return process.env.TEST_API_URL;
}

module.exports = {
  getApiUrl,
  startRuntimeServer,
  stopRuntimeServer,
};
