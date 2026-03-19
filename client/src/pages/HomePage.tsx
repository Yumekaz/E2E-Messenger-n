import React, { useState, FormEvent, ChangeEvent } from 'react';
import type { HomePageProps } from '../types';
import '../styles/landing.css';

function HomePage({ username, onCreateRoom, onJoinRoom, socketConnected }: HomePageProps): JSX.Element {
  const [roomCode, setRoomCode] = useState<string>('');
  const [showJoinForm, setShowJoinForm] = useState<boolean>(false);

  const handleJoin = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (roomCode.trim().length === 6) {
      onJoinRoom(roomCode.trim());
    }
  };

  const handleRoomCodeChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  };

  return (
    <div className="page landing-page home-page">
      <div className="landing-background" aria-hidden="true">
        <span className="landing-orb landing-orb-one" />
        <span className="landing-orb landing-orb-two" />
        <span className="landing-grid" />
      </div>

      <div className="landing-shell home-shell">
        <section className="home-main glass-card">
          <div className="home-hero">
            <div className="brand-row">
              <div className="brand-mark" aria-hidden="true">
                <span>{username.charAt(0).toUpperCase()}</span>
              </div>
              <div className="brand-copy">
                <span className="eyebrow">Local session active</span>
                <span className="brand-subcopy">Private messaging over local Wi‑Fi or hotspot. No internet required.</span>
              </div>
            </div>

            <div className="home-hero-copy">
              <h1>Welcome back, {username}.</h1>
              <p className="landing-lead">
                Create a room or join one with a code. Everyone still needs the same Wi‑Fi, hotspot, or LAN, and the room owner approves every join.
              </p>
            </div>

            <div className="status-chip">
              {socketConnected ? 'Encrypted on your local network' : 'Reconnecting to the local host'}
            </div>
          </div>

          <div className="actions-grid">
            <button
              className="action-card create-action"
              onClick={onCreateRoom}
            >
              <div className="action-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M12 8V16M8 12H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="action-title">Create room</span>
              <span className="action-desc">Start a private encrypted room and approve who joins.</span>
            </button>

            <button
              className="action-card join-action"
              onClick={() => setShowJoinForm(!showJoinForm)}
            >
              <div className="action-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 3H19C20.1 3 21 3.9 21 5V19C21 20.1 20.1 21 19 21H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M10 17L15 12L10 7M15 12H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="action-title">Join room</span>
              <span className="action-desc">Enter with a 6-character room code from the owner.</span>
            </button>
          </div>

          {showJoinForm && (
            <form className="join-form" onSubmit={handleJoin}>
              <div className="code-input-wrapper">
                <label className="field-label" htmlFor="room-code">Room code</label>
                <input
                  id="room-code"
                  type="text"
                  className="input code-input"
                  placeholder="XXXXXX"
                  value={roomCode}
                  onChange={handleRoomCodeChange}
                  maxLength={6}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="code-helper">
                  {roomCode.length}/6 characters
                </div>
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={roomCode.length !== 6}
              >
                Request to join
              </button>
            </form>
          )}
        </section>

        <aside className="home-aside">
          <div className="glass-card context-card">
            <span className="panel-tag">How it works</span>
            <div className="context-list">
              <div className="context-item">
                <span className="context-index">01</span>
                <div>
                  <strong>Local network only</strong>
                  <p>Works without internet, but devices must reach the host on the same Wi-Fi, hotspot, or LAN.</p>
                </div>
              </div>
              <div className="context-item">
                <span className="context-index">02</span>
                <div>
                  <strong>Owner-controlled access</strong>
                  <p>People request to join, and the room owner decides who gets in.</p>
                </div>
              </div>
              <div className="context-item">
                <span className="context-index">03</span>
                <div>
                  <strong>Encrypted by default</strong>
                  <p>Messages and files are protected before they leave your device.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card context-card subtle-card">
            <span className="panel-tag">Best fit</span>
            <p className="context-summary">
              Campus rooms, offline meetups, shared offices, and any setup where internet is unavailable or not wanted.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default HomePage;
