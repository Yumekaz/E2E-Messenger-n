const os = require('os');

const PRIORITY_INTERFACES = [
  'local area connection',
  'wi-fi',
  'ethernet',
  'hotspot',
  'wireless',
  'en0',
  'eth0',
  'wlan0',
];
const SKIP_PATTERNS = ['vethernet', 'wsl', 'hyper-v', 'virtualbox', 'vmware', 'docker', 'loopback'];

function normalizeName(name = '') {
  return name.toLowerCase();
}

function getPriority(name) {
  const normalizedName = normalizeName(name);
  const priorityIndex = PRIORITY_INTERFACES.findIndex((pattern) =>
    normalizedName.includes(pattern)
  );

  return priorityIndex === -1 ? PRIORITY_INTERFACES.length : priorityIndex;
}

function buildCandidateUrls(ip, httpPort, httpsPort, httpsEnabled) {
  const httpUrl = `http://${ip}:${httpPort}`;
  const httpsUrl = `https://${ip}:${httpsPort}`;

  return {
    url: httpsEnabled ? httpsUrl : httpUrl,
    httpUrl,
    httpsUrl,
  };
}

function listNetworkCandidates(httpPort, httpsPort, httpsEnabled) {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  const seenAddresses = new Set();

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) {
        continue;
      }

      if (seenAddresses.has(entry.address)) {
        continue;
      }

      seenAddresses.add(entry.address);

      candidates.push({
        name,
        ip: entry.address,
        priority: getPriority(name),
        skipped: SKIP_PATTERNS.some((pattern) => normalizeName(name).includes(pattern)),
      });
    }
  }

  const viableCandidates = candidates.some((candidate) => !candidate.skipped)
    ? candidates.filter((candidate) => !candidate.skipped)
    : candidates;

  const sorted = viableCandidates.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    if (left.name !== right.name) {
      return left.name.localeCompare(right.name);
    }

    return left.ip.localeCompare(right.ip);
  });

  const mapped = sorted.map((candidate, index) => ({
    name: candidate.name,
    ip: candidate.ip,
    recommended: index === 0,
    ...buildCandidateUrls(candidate.ip, httpPort, httpsPort, httpsEnabled),
  }));

  if (mapped.length > 0) {
    return mapped;
  }

  return [
    {
      name: 'localhost',
      ip: 'localhost',
      recommended: true,
      ...buildCandidateUrls('localhost', httpPort, httpsPort, httpsEnabled),
    },
  ];
}

function getPreferredLocalIp() {
  return listNetworkCandidates(0, 0, false)[0]?.ip || 'localhost';
}

function buildNetworkInfo(httpPort, httpsPort, httpsEnabled) {
  const candidates = listNetworkCandidates(httpPort, httpsPort, httpsEnabled);
  const preferred = candidates[0];

  return {
    url: preferred.url,
    httpUrl: preferred.httpUrl,
    httpsUrl: preferred.httpsUrl,
    ip: preferred.ip,
    port: httpPort,
    httpsPort,
    candidates,
  };
}

module.exports = {
  buildNetworkInfo,
  getPreferredLocalIp,
};
