const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
  WORKSPACE_ROOT,
  STATE_DIR,
  STATE_FILE,
  findFreePort,
  waitForServer,
} = require('./helpers/testServer');

module.exports = async () => {
  fs.rmSync(STATE_DIR, { recursive: true, force: true });
  fs.mkdirSync(STATE_DIR, { recursive: true });

  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-messenger-tests-'));
  const stdoutPath = path.join(runtimeDir, 'server.stdout.log');
  const stderrPath = path.join(runtimeDir, 'server.stderr.log');
  const databasePath = path.join(runtimeDir, 'messenger.db');
  const uploadDir = path.join(runtimeDir, 'uploads');
  const port = await findFreePort();
  const apiUrl = `http://127.0.0.1:${port}`;

  const stdoutFd = fs.openSync(stdoutPath, 'a');
  const stderrFd = fs.openSync(stderrPath, 'a');

  const child = spawn(process.execPath, ['server-enhanced.js'], {
    cwd: WORKSPACE_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DATABASE_PATH: databasePath,
      UPLOAD_DIR: uploadDir,
    },
    stdio: ['ignore', stdoutFd, stderrFd],
    windowsHide: true,
  });

  fs.closeSync(stdoutFd);
  fs.closeSync(stderrFd);

  child.unref();

  const state = {
    pid: child.pid,
    apiUrl,
    port,
    runtimeDir,
    stdoutPath,
    stderrPath,
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  try {
    await waitForServer(apiUrl);
  } catch (error) {
    const stdout = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, 'utf8') : '';
    const stderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, 'utf8') : '';

    throw new Error(
      [
        `Failed to start Jest test server at ${apiUrl}.`,
        error.message,
        '--- stdout ---',
        stdout,
        '--- stderr ---',
        stderr,
      ].join('\n')
    );
  }
};
