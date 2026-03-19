interface AuthModeToggleProps {
  useNewAuth: boolean;
  onToggle: () => void;
}

function AuthModeToggle({ useNewAuth, onToggle }: AuthModeToggleProps): JSX.Element {
  return (
    <section className="auth-mode-switch" aria-label="Session mode">
      <div className="auth-mode-switch__copy">
        <span className="auth-mode-switch__eyebrow">Session mode</span>
        <p>Both modes work on the same Wi-Fi, hotspot, or LAN. Internet is not required.</p>
      </div>
      <div className="auth-mode-switch__options" role="tablist" aria-label="Session mode options">
        <button
          type="button"
          role="tab"
          aria-selected={useNewAuth}
          className={`auth-mode-switch__option ${useNewAuth ? 'is-active' : ''}`}
          onClick={() => {
            if (!useNewAuth) {
              onToggle();
            }
          }}
        >
          <strong>Account mode</strong>
          <span>Saved identity and authenticated rooms</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!useNewAuth}
          className={`auth-mode-switch__option ${!useNewAuth ? 'is-active' : ''}`}
          onClick={() => {
            if (useNewAuth) {
              onToggle();
            }
          }}
        >
          <strong>Quick local session</strong>
          <span>Temporary username for same-network access</span>
        </button>
      </div>
    </section>
  );
}

export default AuthModeToggle;
