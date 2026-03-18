const os = require('os');

const PRIORITY_INTERFACES = ['Local Area Connection*', 'Wi-Fi', 'Ethernet', 'en0', 'eth0', 'wlan0'];
const SKIP_PATTERNS = ['vEthernet', 'WSL', 'Hyper-V', 'VirtualBox', 'VMware', 'Docker', 'Loopback'];

function selectIpv4Address(interfaceEntries = []) {
  for (const iface of interfaceEntries) {
    if (iface.family === 'IPv4' && !iface.internal) {
      return iface.address;
    }
  }

  return null;
}

function getPreferredLocalIp() {
  const interfaces = os.networkInterfaces();

  for (const priorityName of PRIORITY_INTERFACES) {
    for (const [name, entries] of Object.entries(interfaces)) {
      if (!name.toLowerCase().includes(priorityName.toLowerCase())) {
        continue;
      }

      const address = selectIpv4Address(entries);
      if (address) {
        return address;
      }
    }
  }

  for (const [name, entries] of Object.entries(interfaces)) {
    if (SKIP_PATTERNS.some((pattern) => name.includes(pattern))) {
      continue;
    }

    const address = selectIpv4Address(entries);
    if (address) {
      return address;
    }
  }

  return 'localhost';
}

function buildNetworkInfo(httpPort, httpsPort, httpsEnabled) {
  const ip = getPreferredLocalIp();
  const httpUrl = `http://${ip}:${httpPort}`;
  const httpsUrl = `https://${ip}:${httpsPort}`;

  return {
    url: httpsEnabled ? httpsUrl : httpUrl,
    httpUrl,
    httpsUrl,
    ip,
    port: httpPort,
    httpsPort,
  };
}

module.exports = {
  buildNetworkInfo,
  getPreferredLocalIp,
};
