const os = require('os');

const { evaluateLocalNetworkAccess } = require('../backend/utils/localNetwork');

describe('Local network boundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows loopback requests', () => {
    const result = evaluateLocalNetworkAccess('::1');

    expect(result.allowed).toBe(true);
    expect(result.normalizedAddress).toBe('127.0.0.1');
  });

  it('allows addresses inside a local subnet', () => {
    jest.spyOn(os, 'networkInterfaces').mockReturnValue({
      WiFi: [
        {
          address: '192.168.1.10',
          netmask: '255.255.255.0',
          family: 'IPv4',
          internal: false,
        },
      ],
    });

    const result = evaluateLocalNetworkAccess('::ffff:192.168.1.55');

    expect(result.allowed).toBe(true);
    expect(result.normalizedAddress).toBe('192.168.1.55');
    expect(result.matchedNetwork).toMatchObject({
      address: '192.168.1.10',
      netmask: '255.255.255.0',
    });
  });

  it('rejects addresses outside every local subnet', () => {
    jest.spyOn(os, 'networkInterfaces').mockReturnValue({
      WiFi: [
        {
          address: '192.168.1.10',
          netmask: '255.255.255.0',
          family: 'IPv4',
          internal: false,
        },
      ],
    });

    const result = evaluateLocalNetworkAccess('203.0.113.9');

    expect(result.allowed).toBe(false);
    expect(result.normalizedAddress).toBe('203.0.113.9');
    expect(result.matchedNetwork).toBeNull();
  });
});
