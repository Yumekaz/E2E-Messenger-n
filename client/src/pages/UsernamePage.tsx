import React, { useState, FormEvent, ChangeEvent } from 'react';
import '../styles/landing.css';

interface UsernamePageProps {
  onRegister: (name: string) => void;
  encryptionReady: boolean;
}

function UsernamePage({ onRegister, encryptionReady }: UsernamePageProps): JSX.Element {
  const [name, setName] = useState<string>('');

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (name.trim() && encryptionReady) {
      onRegister(name.trim());
    }
  };

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setName(e.target.value);
  };

  return (
    <div className="page landing-page username-page">
      <div className="landing-background" aria-hidden="true">
        <span className="landing-orb landing-orb-one" />
        <span className="landing-orb landing-orb-two" />
        <span className="landing-grid" />
      </div>

      <div className="landing-shell username-shell">
        <section className="landing-intro compact-intro">
          <div className="brand-row">
            <div className="brand-mark" aria-hidden="true">
              <span>M</span>
            </div>
            <div className="brand-copy">
              <span className="eyebrow">Room-code access</span>
              <span className="brand-subcopy">For local rooms on the same Wi-Fi, hotspot, or LAN.</span>
            </div>
          </div>

          <h1>Private messaging over local Wi-Fi or hotspot.</h1>
          <p className="landing-lead">
            No internet required. This path is for quick local joins when you do not want to create a full account.
          </p>

          <div className="value-row" aria-label="Join benefits">
            <span className="value-chip">Fast join</span>
            <span className="value-chip">No internet</span>
            <span className="value-chip">Mobile friendly</span>
          </div>
        </section>

        <section className="landing-panel glass-card">
          <div className="panel-copy">
            <span className="panel-tag">Local room access</span>
            <h2>Choose the name others will see</h2>
            <p>
              Keep it short and recognizable so room owners can approve you quickly.
            </p>
          </div>

          <form className="form username-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="field-label" htmlFor="username-name">Display name</label>
              <input
                id="username-name"
                type="text"
                className="input"
                placeholder="Choose your username"
                value={name}
                onChange={handleNameChange}
                maxLength={20}
                autoFocus
                autoComplete="nickname"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-large"
              disabled={!name.trim() || !encryptionReady}
            >
              {encryptionReady ? (
                <>
                  <span className="btn-icon">🔐</span>
                  Start local session
                </>
              ) : (
                <>
                  <span className="loading-spinner"></span>
                  Generating keys...
                </>
              )}
            </button>
          </form>

          <div className="security-badge soft-badge">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shield-icon">
              <path d="M12 2L4 6V12C4 17 8 21 12 22C16 21 20 17 20 12V6L12 2Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="badge-text">
              <span className="badge-title">Client-side encryption</span>
              <span className="badge-desc">Messages stay encrypted before they leave your device</span>
            </div>
          </div>

          <p className="landing-footnote">
            The host still has to be reachable on the same local network. No public internet route is required.
          </p>
        </section>
      </div>
    </div>
  );
}

export default UsernamePage;
