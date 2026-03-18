const { readServerState } = require('./testServer');

const API_URL = process.env.TEST_API_URL || readServerState().apiUrl;

module.exports = {
  API_URL,
};
