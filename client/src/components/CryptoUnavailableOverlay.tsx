interface CryptoUnavailableOverlayProps {
  origin: string;
  onReload: () => void;
}

function CryptoUnavailableOverlay({
  origin,
  onReload,
}: CryptoUnavailableOverlayProps): JSX.Element {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0b1e',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        zIndex: 9999,
        textAlign: 'center',
      }}
    >
      <h2 style={{ color: '#ff4b4b', marginBottom: '1rem' }}>⚠️ Security Feature Restricted</h2>
      <p
        style={{
          maxWidth: '600px',
          lineHeight: '1.6',
          marginBottom: '2rem',
          color: '#a0a0b0',
        }}
      >
        This app uses <strong>Web Crypto API</strong> for end-to-end encryption.
        Modern browsers block this API on &quot;insecure&quot; connections.
      </p>
      <div
        style={{
          background: '#1a1b2e',
          padding: '1.5rem',
          borderRadius: '12px',
          textAlign: 'left',
          maxWidth: '600px',
          width: '100%',
        }}
      >
        <h3 style={{ color: '#00d4aa', marginBottom: '1rem' }}>
          How to fix (Chrome/Edge/Brave):
        </h3>
        <ol
          style={{
            paddingLeft: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.8rem',
          }}
        >
          <li>
            Open:{' '}
            <code
              style={{
                background: 'rgba(255,255,255,0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              chrome://flags/#unsafely-treat-insecure-origin-as-secure
            </code>
          </li>
          <li>Enable the flag</li>
          <li>
            Add: <code style={{ color: '#00d4aa' }}>{origin}</code>
          </li>
          <li>Relaunch browser</li>
        </ol>
      </div>
      <button
        onClick={onReload}
        style={{
          marginTop: '2rem',
          padding: '12px 24px',
          background: '#00d4aa',
          border: 'none',
          borderRadius: '8px',
          color: '#000',
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
      >
        Reload App
      </button>
    </div>
  );
}

export default CryptoUnavailableOverlay;
