const fs = require('fs');
const { STATE_DIR, STATE_FILE, readServerState } = require('./helpers/testServer');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopProcess(pid) {
  if (!pid) {
    return;
  }

  try {
    process.kill(pid);
  } catch (error) {
    if (error.code === 'ESRCH') {
      return;
    }
  }

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await wait(100);
    } catch (error) {
      if (error.code === 'ESRCH') {
        return;
      }
    }
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') {
      throw error;
    }
  }
}

module.exports = async () => {
  if (!fs.existsSync(STATE_FILE)) {
    return;
  }

  const state = readServerState();

  await stopProcess(state.pid);

  if (state.runtimeDir) {
    fs.rmSync(state.runtimeDir, { recursive: true, force: true });
  }

  fs.rmSync(STATE_DIR, { recursive: true, force: true });
};
