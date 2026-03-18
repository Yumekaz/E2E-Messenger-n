function buildIdentity(prefix, domain = 'example.com') {
  const safePrefix = (prefix || 'user').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 8) || 'user';
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
  const username = `${safePrefix}_${suffix}`.slice(0, 20);

  return {
    email: `${username}@${domain}`,
    username,
    password: 'TestPassword123',
  };
}

module.exports = {
  buildIdentity,
};
