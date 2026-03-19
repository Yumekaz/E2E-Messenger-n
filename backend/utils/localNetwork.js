const net = require('net');
const os = require('os');

const SKIP_PATTERNS = ['vethernet', 'wsl', 'hyper-v', 'virtualbox', 'vmware', 'docker'];

function normalizeName(name = '') {
  return name.toLowerCase();
}

function normalizeRemoteAddress(remoteAddress) {
  if (!remoteAddress) {
    return null;
  }

  const firstSegment = String(remoteAddress).split(',')[0].trim();

  if (firstSegment === '::1') {
    return '127.0.0.1';
  }

  if (firstSegment.startsWith('::ffff:')) {
    return firstSegment.slice(7);
  }

  return firstSegment;
}

function isLoopbackAddress(address) {
  return address === '127.0.0.1' || address.startsWith('127.');
}

function ipv4ToInteger(address) {
  return address
    .split('.')
    .map((segment) => parseInt(segment, 10))
    .reduce((result, segment) => ((result << 8) | segment) >>> 0, 0);
}

function listLocalNetworks() {
  const interfaces = os.networkInterfaces();
  const networks = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal || !entry.address || !entry.netmask) {
        continue;
      }

      if (SKIP_PATTERNS.some((pattern) => normalizeName(name).includes(pattern))) {
        continue;
      }

      networks.push({
        name,
        address: entry.address,
        netmask: entry.netmask,
      });
    }
  }

  return networks;
}

function isAddressInSubnet(remoteAddress, network) {
  const remote = ipv4ToInteger(remoteAddress);
  const base = ipv4ToInteger(network.address);
  const mask = ipv4ToInteger(network.netmask);

  return (remote & mask) === (base & mask);
}

function evaluateLocalNetworkAccess(remoteAddress) {
  const normalizedAddress = normalizeRemoteAddress(remoteAddress);
  if (!normalizedAddress) {
    return {
      allowed: false,
      normalizedAddress: null,
      matchedNetwork: null,
    };
  }

  if (net.isIP(normalizedAddress) !== 4) {
    return {
      allowed: false,
      normalizedAddress,
      matchedNetwork: null,
    };
  }

  if (isLoopbackAddress(normalizedAddress)) {
    return {
      allowed: true,
      normalizedAddress,
      matchedNetwork: {
        name: 'loopback',
        address: '127.0.0.1',
        netmask: '255.0.0.0',
      },
    };
  }

  const localNetworks = listLocalNetworks();
  const matchedNetwork =
    localNetworks.find((network) => isAddressInSubnet(normalizedAddress, network)) || null;

  return {
    allowed: matchedNetwork !== null,
    normalizedAddress,
    matchedNetwork,
  };
}

module.exports = {
  evaluateLocalNetworkAccess,
  listLocalNetworks,
  normalizeRemoteAddress,
};
