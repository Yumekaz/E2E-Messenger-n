import React, { useState, FormEvent, ChangeEvent } from 'react';
import authService from '../services/authService';
import type { AuthPageProps, AuthUser } from '../types';
import '../styles/landing.css';

function AuthPage({ onAuth, encryptionReady }: AuthPageProps): JSX.Element {
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [email, setEmail] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate
      if (!isLogin && password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      let result;
      if (isLogin) {
        result = await authService.login(email, password);
      } else {
        result = await authService.register(email, username, password);
      }

      // Success - pass user info to parent
      onAuth(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = (): void => {
    setIsLogin(!isLogin);
    setError('');
  };

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setEmail(e.target.value);
  };

  const handleUsernameChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setUsername(e.target.value);
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setPassword(e.target.value);
  };

  const handleConfirmPasswordChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setConfirmPassword(e.target.value);
  };

  return (
    <div className="page landing-page auth-page">
      <div className="landing-background" aria-hidden="true">
        <span className="landing-orb landing-orb-one" />
        <span className="landing-orb landing-orb-two" />
        <span className="landing-grid" />
      </div>

      <div className="landing-shell auth-shell">
        <section className="landing-intro">
          <div className="brand-row">
            <div className="brand-mark" aria-hidden="true">
              <span>M</span>
            </div>
            <div className="brand-copy">
              <span className="eyebrow">Offline-first encrypted messenger</span>
              <span className="brand-subcopy">No internet required. Same Wi‑Fi, hotspot, or LAN.</span>
            </div>
          </div>

          <h1>Private messaging over local Wi-Fi or hotspot.</h1>
          <p className="landing-lead">
            No internet required. Messages, files, and approvals stay encrypted on-device while the room owner decides who gets in.
          </p>

          <div className="value-row" aria-label="Product highlights">
            <span className="value-chip">No internet</span>
            <span className="value-chip">E2E encrypted</span>
            <span className="value-chip">Owner-approved entry</span>
          </div>

          <div className="landing-notes">
            <div className="note-card">
              <span className="note-title">Local network only</span>
              <span className="note-copy">Every device still needs access to the same Wi-Fi, hotspot, or LAN.</span>
            </div>
            <div className="note-card">
              <span className="note-title">Built for mixed devices</span>
              <span className="note-copy">Use it from laptop or phone without changing the room flow.</span>
            </div>
            <div className="note-card note-card-wide">
              <span className="note-title">Two intentional modes</span>
              <span className="note-copy">Use account sign-in for repeat access, or switch to room-code mode for a quick local join.</span>
            </div>
          </div>
        </section>

        <section className="landing-panel glass-card">
          <div className="panel-copy">
            <span className="panel-tag">{isLogin ? 'Secure sign in' : 'Create account'}</span>
            <h2>{isLogin ? 'Return to your local room' : 'Create your access account'}</h2>
            <p>
              Sign in to reconnect your encrypted identity on the same local network.
            </p>
          </div>

          <form className="form auth-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="field-label" htmlFor="auth-email">Email address</label>
              <input
                id="auth-email"
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={handleEmailChange}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            {!isLogin && (
              <div className="input-group">
                <label className="field-label" htmlFor="auth-username">Username</label>
                <input
                  id="auth-username"
                  type="text"
                  className="input"
                  placeholder="Choose a username"
                  value={username}
                  onChange={handleUsernameChange}
                  minLength={3}
                  maxLength={20}
                  pattern="^[a-zA-Z0-9_]+$"
                  required
                  autoComplete="username"
                />
              </div>
            )}

            <div className="input-group">
              <label className="field-label" htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                className="input"
                placeholder="Enter your password"
                value={password}
                onChange={handlePasswordChange}
                minLength={8}
                required
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
            </div>

            {!isLogin && (
              <div className="input-group">
                <label className="field-label" htmlFor="auth-confirm-password">Confirm password</label>
                <input
                  id="auth-confirm-password"
                  type="password"
                  className="input"
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
            )}

            {error && (
              <div className="error-message" role="alert">
                <span className="error-icon">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-large"
              disabled={loading || !encryptionReady}
            >
              {loading ? (
                <>
                  <span className="loading-spinner"></span>
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </>
              ) : encryptionReady ? (
                <>
                  <span className="btn-icon">🔐</span>
                  {isLogin ? 'Sign in' : 'Create account'}
                </>
              ) : (
                <>
                  <span className="loading-spinner"></span>
                  Initializing encryption...
                </>
              )}
            </button>
          </form>

          <div className="auth-toggle">
            <span>{isLogin ? "Need an account?" : "Already have an account?"}</span>
            <button type="button" className="link-btn" onClick={toggleMode}>
              {isLogin ? 'Create one' : 'Sign in'}
            </button>
          </div>

          <div className="security-badge soft-badge">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shield-icon">
              <path d="M12 2L4 6V12C4 17 8 21 12 22C16 21 20 17 20 12V6L12 2Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="badge-text">
              <span className="badge-title">Account protection</span>
              <span className="badge-desc">Passwords are hashed before storage</span>
            </div>
          </div>

          <p className="landing-footnote">
            The app works without internet, but your device still needs access to the host over the same network.
          </p>
        </section>
      </div>

    </div>
  );
}

export default AuthPage;
