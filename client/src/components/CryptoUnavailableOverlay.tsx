interface CryptoUnavailableOverlayProps {
  origin: string;
  onReload: () => void;
}

function CryptoUnavailableOverlay({
  origin,
  onReload,
}: CryptoUnavailableOverlayProps): JSX.Element {
  return (
    <div className="crypto-overlay" role="alertdialog" aria-modal="true">
      <div className="crypto-overlay__panel">
        <span className="crypto-overlay__eyebrow">Secure context required</span>
        <h2>End-to-end encryption cannot start on this origin yet.</h2>
        <p className="crypto-overlay__intro">
          This app depends on the Web Crypto API. Browsers block it on origins they
          consider insecure, so the room cannot safely send or decrypt messages until
          the local address is trusted.
        </p>

        <div className="crypto-overlay__section">
          <h3>Recommended fix</h3>
          <p>Open the app over HTTPS or use the trusted local IP address shown by the server.</p>
        </div>

        <div className="crypto-overlay__section">
          <h3>Browser fallback</h3>
          <ol className="crypto-overlay__steps">
            <li>
              Open <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>
            </li>
            <li>Enable the flag.</li>
            <li>
              Add <code>{origin}</code>
            </li>
            <li>Relaunch the browser, then reload this page.</li>
          </ol>
        </div>

        <div className="crypto-overlay__actions">
          <button type="button" className="btn btn-primary" onClick={onReload}>
            Reload app
          </button>
        </div>
      </div>
    </div>
  );
}

export default CryptoUnavailableOverlay;
