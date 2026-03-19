const { startRuntimeServer, stopRuntimeServer } = require('./helpers/runtimeServer');

beforeAll(async () => {
  await startRuntimeServer();
}, 30000);

afterAll(async () => {
  await stopRuntimeServer();
}, 30000);
