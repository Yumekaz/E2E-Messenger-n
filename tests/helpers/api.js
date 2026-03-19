const { getApiUrl } = require('./runtimeServer');

module.exports = {
  getApiUrl,
  get API_URL() {
    return getApiUrl();
  },
};
