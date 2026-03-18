import React, { useState, useEffect, useRef } from 'react';
import socket, { reconnectWithAuth } from './socket';
import { RoomEncryption } from './crypto/encryption';
import authService from './services/authService';

// Pages
import AuthPage from './pages/AuthPage';
import UsernamePage from './pages/UsernamePage';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';

// Components
import JoinRequestModal from './components/JoinRequestModal';
import Toast from './components/Toast';
import CryptoUnavailableOverlay from './components/CryptoUnavailableOverlay';

import './styles/app.css';

// Types
import type { AuthUser, JoinRequest } from './types';
import useToast from './hooks/useToast';

type PageType = 'auth' | 'username' | 'home' | 'room';
type EncryptionStatus = 'initializing' | 'ready' | 'error';

interface RoomState {
  roomId: string;
  roomCode: string;
  isOwner: boolean;
  memberKeys: Record<string, string>;
  roomType?: 'legacy' | 'authenticated';
}

function App(): JSX.Element {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(authService.isAuthenticated());
  const [useNewAuth, setUseNewAuth] = useState<boolean>(true);

  // App state
  const [currentPage, setCurrentPage] = useState<PageType>('auth');
  const [username, setUsername] = useState<string>('');
  const [currentRoom, setCurrentRoom] = useState<RoomState | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [encryptionStatus, setEncryptionStatus] = useState<EncryptionStatus>('initializing');

  // Refs
  const encryptionRef = useRef<RoomEncryption | null>(null);
  const pendingRoomCodeRef = useRef<string | null>(null);
  const { toast, showToast } = useToast();

  const emitRegistration = (nextUsername: string): boolean => {
    const publicKey = encryptionRef.current?.publicKeyExported;
    if (!nextUsername || !publicKey) {
      return false;
    }

    socket.emit('register', {
      username: nextUsername,
      publicKey,
    });
    return true;
  };

  // Check for room code in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      pendingRoomCodeRef.current = roomParam;
      // Auto-switch to legacy mode for QR code joins (mobile users)
      if (!authService.isAuthenticated()) {
        setUseNewAuth(false);
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Initialize encryption
  useEffect(() => {
    const initEncryption = async (): Promise<void> => {
      try {
        if (!window.crypto || !window.crypto.subtle) {
          throw new Error('Web Crypto API not available');
        }
        encryptionRef.current = new RoomEncryption();
        await encryptionRef.current.initialize();
        setEncryptionStatus('ready');
      } catch (err) {
        console.error('Encryption init failed:', err);
        setEncryptionStatus('error');
      }
    };
    initEncryption();
  }, []);

  // Check existing auth on mount
  useEffect(() => {
    if (authService.isAuthenticated()) {
      const user = authService.getUser();
      if (user) {
        setUsername(user.username);
        setIsAuthenticated(true);
        setCurrentPage('home');
        reconnectWithAuth();

        // Register with socket after reconnection
        const registerOnConnect = () => {
          emitRegistration(user.username);
          socket.off('connect', registerOnConnect);
        };

        // Wait for both socket connection and encryption to be ready
        const tryRegister = () => {
          if (socket.connected && emitRegistration(user.username)) {
            return;
          } else if (!socket.connected) {
            socket.on('connect', registerOnConnect);
          }
        };

        // Small delay to ensure encryption is ready
        const registerTimer = setTimeout(tryRegister, 500);

        return () => {
          clearTimeout(registerTimer);
          socket.off('connect', registerOnConnect);
        };
      }
    } else if (useNewAuth) {
      setCurrentPage('auth');
    } else {
      setCurrentPage('username');
    }
  }, [useNewAuth]);

  // Handle socket connection/reconnection - always re-register
  useEffect(() => {
    const handleConnect = () => {
      // Only register if we have a username and encryption is ready
      const user = authService.getUser();
      const currentUsername = user?.username || username;

      emitRegistration(currentUsername);
    };

    socket.on('connect', handleConnect);

    // If already connected, register now
    if (socket.connected && username && encryptionRef.current?.publicKeyExported) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
    };
  }, [username, encryptionStatus]);

  // Socket event listeners
  useEffect(() => {
    socket.on('registered', ({ username: acceptedUsername }: { username: string }) => {
      setUsername(acceptedUsername);
      setCurrentPage('home');
      showToast('🔐 Secure session started', 'success');

      if (pendingRoomCodeRef.current) {
        handleJoinRoom(pendingRoomCodeRef.current);
        pendingRoomCodeRef.current = null;
      }
    });

    socket.on('username-taken', () => {
      showToast('Username taken. Try another!', 'error');
    });

    socket.on('room-created', async ({ roomId, roomCode, roomType }: { roomId: string; roomCode: string; roomType?: 'legacy' | 'authenticated' }) => {
      if (encryptionRef.current) {
        await encryptionRef.current.setRoomKey(roomCode, [encryptionRef.current.publicKeyExported!]);

        setCurrentRoom({
          roomId,
          roomCode,
          isOwner: true,
          memberKeys: { [username]: encryptionRef.current.publicKeyExported! },
          roomType: roomType || 'legacy'
        });
        setCurrentPage('room');
        const typeLabel = roomType === 'authenticated' ? ' (Authenticated)' : ' (Legacy)';
        showToast(`Room ${roomCode} created${typeLabel}`, 'success');
      }
    });

    socket.on('join-request', ({ requestId, username: requesterName, publicKey, roomId }: JoinRequest & { roomId: string }) => {
      setJoinRequests(prev => [...prev, { requestId, username: requesterName, publicKey, roomId }]);
      showToast(`${requesterName} wants to join`, 'info');
    });

    socket.on('join-approved', async ({ roomId, roomCode, roomType, memberKeys }: { roomId: string; roomCode: string; roomType?: 'legacy' | 'authenticated'; memberKeys: Record<string, string> }) => {
      if (encryptionRef.current) {
        await encryptionRef.current.setRoomKey(roomCode, Object.values(memberKeys));

        setCurrentRoom({ roomId, roomCode, isOwner: false, memberKeys, roomType: roomType || 'legacy' });
        setCurrentPage('room');
        const typeLabel = roomType === 'authenticated' ? ' (Authenticated)' : '';
        showToast(`🔐 Joined secure room${typeLabel}`, 'success');
      }
    });

    socket.on('join-denied', () => {
      showToast('Join request denied', 'error');
    });

    socket.on('error', ({ message }: { message: string }) => {
      showToast(message, 'error');
    });

    socket.on('room-closed', () => {
      setCurrentRoom(null);
      setCurrentPage('home');
      showToast('Room was closed by owner', 'error');
    });

    return () => {
      socket.off('registered');
      socket.off('username-taken');
      socket.off('room-created');
      socket.off('join-request');
      socket.off('join-approved');
      socket.off('join-denied');
      socket.off('error');
      socket.off('room-closed');
    };
  }, [username]);

  // Auth handlers
  const handleAuth = async (user: AuthUser): Promise<void> => {
    setUsername(user.username);
    setIsAuthenticated(true);
    reconnectWithAuth();

    // Wait for socket to reconnect before registering
    const registerAfterConnect = () => {
      if (encryptionStatus === 'ready') {
        emitRegistration(user.username);
      }
      socket.off('connect', registerAfterConnect);
    };

    if (socket.connected) {
      registerAfterConnect();
    } else {
      socket.on('connect', registerAfterConnect);
    }
  };

  const handleLogout = async (): Promise<void> => {
    await authService.logout();
    setIsAuthenticated(false);
    setUsername('');
    setCurrentPage('auth');
    setCurrentRoom(null);
    showToast('Logged out successfully', 'success');
  };

  // Legacy username registration
  const handleRegister = async (name: string): Promise<void> => {
    if (encryptionStatus !== 'ready') {
      showToast('Encryption initializing...', 'info');
      return;
    }

    emitRegistration(name);
  };

  // Room handlers
  const handleCreateRoom = (): void => {
    socket.emit('create-room');
  };

  const handleJoinRoom = (roomCode: string): void => {
    socket.emit('request-join', { roomCode: roomCode.toUpperCase() });
    showToast('Join request sent...', 'info');
  };

  const handleApproveJoin = async ({ requestId }: { requestId: string }): Promise<void> => {
    socket.emit('approve-join', { requestId });
    setJoinRequests(prev => prev.filter(req => req.requestId !== requestId));
  };

  const handleDenyJoin = (requestId: string): void => {
    socket.emit('deny-join', { requestId });
    setJoinRequests(prev => prev.filter(req => req.requestId !== requestId));
  };

  const handleUpdateRoomKey = async (memberKeys: Record<string, string>): Promise<void> => {
    if (currentRoom && encryptionRef.current) {
      await encryptionRef.current.setRoomKey(currentRoom.roomCode, Object.values(memberKeys));
      setCurrentRoom(prev => prev ? { ...prev, memberKeys } : null);
    }
  };

  const handleLeaveRoom = (): void => {
    if (currentRoom) {
      socket.emit('leave-room', { roomId: currentRoom.roomId });
    }
    setCurrentRoom(null);
    setCurrentPage('home');
  };

  // Toggle auth mode
  const toggleAuthMode = (): void => {
    setUseNewAuth(!useNewAuth);
    setCurrentPage(useNewAuth ? 'username' : 'auth');
  };

  return (
    <div className="app">
      <div className="encryption-indicator">
        <div className={`indicator-dot ${encryptionStatus}`}></div>
        <span>{encryptionStatus === 'ready' ? 'E2E Encrypted' : 'Initializing...'}</span>
        {isAuthenticated && (
          <button className="logout-btn" onClick={handleLogout} title="Logout">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
              <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 17L21 12L16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
        <AuthPage
          onAuth={handleAuth}
          encryptionReady={encryptionStatus === 'ready'}
        />
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
        />
      )}

      {currentPage === 'room' && currentRoom && encryptionRef.current && (
        <RoomPage
          roomId={currentRoom.roomId}
          roomCode={currentRoom.roomCode}
          username={username}
          isOwner={currentRoom.isOwner}
          encryption={encryptionRef.current}
          onUpdateRoomKey={handleUpdateRoomKey}
          onLeave={handleLeaveRoom}
          roomType={currentRoom.roomType}
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

      {/* Dev toggle for auth mode */}
      {(currentPage === 'auth' || currentPage === 'username') && (
        <button
          onClick={toggleAuthMode}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '8px 16px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px',
            color: '#888',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          {useNewAuth ? 'Use Legacy Mode' : 'Use Auth Mode'}
        </button>
      )}
    </div>
  );
}

export default App;
