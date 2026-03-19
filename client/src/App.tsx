import React from 'react';

import AuthModeToggle from './components/AuthModeToggle';
import CryptoUnavailableOverlay from './components/CryptoUnavailableOverlay';
import JoinRequestModal from './components/JoinRequestModal';
import Toast from './components/Toast';
import useMessengerController from './hooks/useMessengerController';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';
import UsernamePage from './pages/UsernamePage';

import './styles/app.css';

function App(): JSX.Element {
  const {
    currentPage,
    currentRoom,
    encryption,
    encryptionStatus,
    isAuthenticated,
    joinRequests,
    socketConnected,
    toast,
    useNewAuth,
    username,
    handleApproveJoin,
    handleAuth,
    handleCreateRoom,
    handleDenyJoin,
    handleJoinRoom,
    handleLeaveRoom,
    handleLogout,
    handleRegister,
    handleUpdateRoomKey,
    toggleAuthMode,
  } = useMessengerController();

  return (
    <div className="app">
      <div className="encryption-indicator">
        <div className={`indicator-dot ${encryptionStatus}`}></div>
        <span>{encryptionStatus === 'ready' ? 'E2E ready' : 'Initializing encryption...'}</span>
        <span className={`connection-chip ${socketConnected ? 'is-online' : 'is-reconnecting'}`}>
          {socketConnected ? 'Local link active' : 'Reconnecting'}
        </span>
        {isAuthenticated && (
          <button className="logout-btn" onClick={handleLogout} title="Logout">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
            >
              <path
                d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M16 17L21 12L16 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M21 12H9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {encryptionStatus === 'error' && (
        <CryptoUnavailableOverlay
          origin={window.location.origin}
          onReload={() => window.location.reload()}
        />
      )}

      {currentPage === 'auth' && useNewAuth && (
        <AuthPage onAuth={handleAuth} encryptionReady={encryptionStatus === 'ready'} />
      )}

      {currentPage === 'username' && !useNewAuth && (
        <UsernamePage
          onRegister={handleRegister}
          encryptionReady={encryptionStatus === 'ready'}
        />
      )}

      {currentPage === 'home' && (
        <HomePage
          username={username}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          socketConnected={socketConnected}
        />
      )}

      {currentPage === 'room' && currentRoom && encryption && (
        <RoomPage
          roomId={currentRoom.roomId}
          roomCode={currentRoom.roomCode}
          username={username}
          isOwner={currentRoom.isOwner}
          encryption={encryption}
          onUpdateRoomKey={handleUpdateRoomKey}
          onLeave={handleLeaveRoom}
          roomType={currentRoom.roomType}
          socketConnected={socketConnected}
        />
      )}

      {joinRequests.length > 0 && (
        <JoinRequestModal
          requests={joinRequests}
          onApprove={handleApproveJoin}
          onDeny={handleDenyJoin}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}

      {(currentPage === 'auth' || currentPage === 'username') && (
        <AuthModeToggle useNewAuth={useNewAuth} onToggle={toggleAuthMode} />
      )}
    </div>
  );
}

export default App;
