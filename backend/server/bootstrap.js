require('dotenv').config();

const config = require('../config');
const logger = require('../utils/logger');
const db = require('../database/db');
const setupSocketHandlers = require('../socket');
const { getPreferredLocalIp } = require('../utils/networkInfo');
const createApp = require('../app/createApp');
const buildBanner = require('./buildBanner');
const { DEFAULT_HTTPS_PORT, createServerBundle } = require('./createServerBundle');
const registerProcessHandlers = require('./registerProcessHandlers');

function startListening(server, port, host) {
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off('error', handleError);
      reject(error);
    };

    server.once('error', handleError);
    server.listen(port, host, () => {
      server.off('error', handleError);
      resolve();
    });
  });
}

async function startServer() {
  const httpsPort = DEFAULT_HTTPS_PORT;
  let httpsEnabled = false;

  const app = createApp({
    config,
    db,
    httpsPort,
    isHttpsEnabled: () => httpsEnabled,
  });

  const { server, httpsServer, io } = createServerBundle(app, logger, { httpsPort });
  httpsEnabled = Boolean(httpsServer);

  const shutdown = registerProcessHandlers({ db, server, httpsServer, logger });

  try {
    await db.initializeDatabase();
    setupSocketHandlers(io);

    await startListening(server, config.port, config.host);
    logger.info('HTTP server started', { port: config.port, host: config.host, env: config.env });

    if (httpsServer) {
      await startListening(httpsServer, httpsPort, config.host);
      logger.info('HTTPS server started', { port: httpsPort, host: config.host });
    }

    const localIP = getPreferredLocalIp();
    setTimeout(() => {
      console.log(
        buildBanner({
          env: config.env,
          httpPort: config.port,
          httpsPort,
          httpsEnabled,
          localIP,
        })
      );
    }, 500);

    return { app, server, httpsServer, io };
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    shutdown('Startup failure', 1);
    return null;
  }
}

module.exports = {
  startServer,
};
