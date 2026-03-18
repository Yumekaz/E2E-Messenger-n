const fs = require('fs');
const os = require('os');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..');
const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-messenger-playwright-'));
const uploadDir = path.join(runtimeDir, 'uploads');

fs.mkdirSync(uploadDir, { recursive: true });

process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '3100';
process.env.DISABLE_HTTPS = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret-key';
process.env.DATABASE_PATH = path.join(runtimeDir, 'messenger.db');
process.env.UPLOAD_DIR = uploadDir;

require(path.join(workspaceRoot, 'server-enhanced.js'));
