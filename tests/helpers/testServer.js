const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');
const STATE_DIR = path.join(WORKSPACE_ROOT, 'tests', '.tmp');
const STATE_FILE = path.join(STATE_DIR, 'test-server.json');

function readServerState() {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(`Test server state file not found at ${STATE_FILE}`);
  }

  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });

    server.on('error', reject);
  });
}

async function waitForServer(apiUrl, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const request = http.get(new URL('/api/health', apiUrl), (response) => {
          response.resume();

          if (response.statusCode === 200) {
            resolve();
            return;
          }

          reject(new Error(`Unexpected status: ${response.statusCode}`));
        });

        request.on('error', reject);
        request.setTimeout(2000, () => {
          request.destroy(new Error('Health check timed out'));
        });
      });

      return;
    } catch (error) {
      lastError = error;
      await wait(250);
    }
  }

  throw new Error(`Timed out waiting for test server: ${lastError ? lastError.message : 'unknown error'}`);
}

module.exports = {
  WORKSPACE_ROOT,
  STATE_DIR,
  STATE_FILE,
  readServerState,
  findFreePort,
  waitForServer,
};
