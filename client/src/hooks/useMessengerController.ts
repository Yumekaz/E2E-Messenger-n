import { useEffect, useRef, useState } from 'react';
import socket, { reconnectWithAuth, reconnectWithoutAuth } from '../socket';
import authService from '../services/authService';
import useEncryption from './useEncryption';
import useToast from './useToast';
import type {
  AppPage,
  AuthUser,
  EncryptionStatus,
  JoinApprovedPayload,
  JoinRequest,
  RoomCreatedPayload,
  RoomState,
  RoomType,
  ServerToClientEvents,
} from '../types';

function resolveAppPage(useNewAuth: boolean): AppPage {
  return useNewAuth ? 'auth' : 'username';
}

function normalizeRoomType(roomType?: RoomType): RoomType {
  return roomType || 'legacy';
}

interface UseMessengerControllerResult {
  currentPage: AppPage;
  currentRoom: RoomState | null;
  encryption: ReturnType<typeof useEncryption>['encryption'];
  encryptionStatus: EncryptionStatus;
  isAuthenticated: boolean;
  joinRequests: JoinRequest[];
  socketConnected: boolean;
  toast: ReturnType<typeof useToast>['toast'];
  useNewAuth: boolean;
  username: string;
  handleApproveJoin: (data: { requestId: string }) => Promise<void>;
  handleAuth: (user: AuthUser) => Promise<void>;
  handleCreateRoom: () => void;
  handleDenyJoin: (requestId: string) => void;
  handleJoinRoom: (roomCode: string) => void;
  handleLeaveRoom: () => void;
  handleLogout: () => Promise<void>;
  handleRegister: (name: string) => Promise<void>;
  handleUpdateRoomKey: (memberKeys: Record<string, string>) => Promise<void>;
  toggleAuthMode: () => void;
}

function useMessengerController(): UseMessengerControllerResult {
  const [isAuthenticated, setIsAuthenticated] = useState(authService.isAuthenticated());
  const [useNewAuth, setUseNewAuth] = useState(true);
  const [currentPage, setCurrentPage] = useState<AppPage>('auth');
  const [username, setUsername] = useState('');
  const [currentRoom, setCurrentRoom] = useState<RoomState | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [socketConnected, setSocketConnected] = useState(socket.connected);

  const pendingRoomCodeRef = useRef<string | null>(null);
  const usernameRef = useRef('');
  const useNewAuthRef = useRef(true);
  const currentRoomRef = useRef<RoomState | null>(null);
  const legacySessionRef = useRef(false);
  const hasRegisteredRef = useRef(false);
  const pendingReconnectRef = useRef(false);
  const authRefreshPromiseRef = useRef<Promise<void> | null>(null);
  const { toast, showToast } = useToast();
  const showToastRef = useRef(showToast);
  const { encryption, encryptionRef, encryptionStatus } = useEncryption();

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  useEffect(() => {
    useNewAuthRef.current = useNewAuth;
  }, [useNewAuth]);

  useEffect(() => {
    currentRoomRef.current = currentRoom;
  }, [currentRoom]);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const clearActiveSessionState = (nextPage: AppPage): void => {
    pendingRoomCodeRef.current = null;
    usernameRef.current = '';
    currentRoomRef.current = null;
    legacySessionRef.current = false;
    hasRegisteredRef.current = false;
    pendingReconnectRef.current = false;
    setIsAuthenticated(false);
    setUsername('');
    setCurrentRoom(null);
    setJoinRequests([]);
    setCurrentPage(nextPage);
  };

  useEffect(() => {
    const handleConnectState = () => {
      setSocketConnected(true);
    };

    const handleDisconnectState = () => {
      setSocketConnected(false);

      if (hasRegisteredRef.current) {
        pendingReconnectRef.current = true;
        showToastRef.current('Connection lost. Reconnecting to the local room...', 'warning');
      }
    };

    socket.on('connect', handleConnectState);
    socket.on('disconnect', handleDisconnectState);

    if (socket.connected) {
      handleConnectState();
    }

    return () => {
      socket.off('connect', handleConnectState);
      socket.off('disconnect', handleDisconnectState);
    };
  }, []);

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

  const requestJoinRoom = (roomCode: string): void => {
    socket.emit('request-join', { roomCode: roomCode.toUpperCase() });
    showToastRef.current('Join request sent...', 'info');
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');

    if (roomParam) {
      pendingRoomCodeRef.current = roomParam;

      if (!authService.isAuthenticated()) {
        setUseNewAuth(false);
      }

      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const storedUser = authService.getUser();

    if (!authService.isAuthenticated() || !storedUser) {
      setIsAuthenticated(false);
      legacySessionRef.current = false;
      setCurrentPage(resolveAppPage(useNewAuth));
      return;
    }

    legacySessionRef.current = false;
    setUsername(storedUser.username);
    setIsAuthenticated(true);
    setCurrentPage('home');
    reconnectWithAuth();

    if (encryptionStatus !== 'ready') {
      return;
    }

    const registerOnConnect = () => {
      emitRegistration(storedUser.username);
      socket.off('connect', registerOnConnect);
    };

    const registerTimer = setTimeout(() => {
      if (socket.connected && emitRegistration(storedUser.username)) {
        return;
      }

      if (!socket.connected) {
        socket.on('connect', registerOnConnect);
      }
    }, 500);

    return () => {
      clearTimeout(registerTimer);
      socket.off('connect', registerOnConnect);
    };
  }, [useNewAuth, encryptionStatus]);

  useEffect(() => {
    if (encryptionStatus !== 'ready') {
      return;
    }

    const handleConnect = () => {
      const storedUsername = authService.getUser()?.username;
      if (storedUsername) {
        emitRegistration(storedUsername);
        return;
      }

      if (legacySessionRef.current && usernameRef.current) {
        emitRegistration(usernameRef.current);
      }
    };

    socket.on('connect', handleConnect);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
    };
  }, [encryptionStatus]);

  useEffect(() => {
    const handleAuthExpired: ServerToClientEvents['auth-expired'] = async () => {
      if (authRefreshPromiseRef.current) {
        await authRefreshPromiseRef.current;
        return;
      }

      authRefreshPromiseRef.current = (async () => {
        try {
          await authService.refreshAccessToken();
          reconnectWithAuth();
          showToastRef.current('Session refreshed for the local room.', 'info');
        } catch {
          await authService.logout();
          clearActiveSessionState(resolveAppPage(useNewAuthRef.current));
          reconnectWithoutAuth();
          showToastRef.current('Session expired. Sign in again to rejoin authenticated rooms.', 'error');
        } finally {
          authRefreshPromiseRef.current = null;
        }
      })();

      await authRefreshPromiseRef.current;
    };

    const handleRegistered: ServerToClientEvents['registered'] = ({
      username: acceptedUsername,
    }) => {
      const activeRoom = currentRoomRef.current;
      const isReconnect = pendingReconnectRef.current && hasRegisteredRef.current;

      pendingReconnectRef.current = false;
      hasRegisteredRef.current = true;
      setUsername(acceptedUsername);
      setCurrentPage(activeRoom ? 'room' : 'home');

      const pendingRoomCode = pendingRoomCodeRef.current;
      if (pendingRoomCode) {
        pendingRoomCodeRef.current = null;
        requestJoinRoom(pendingRoomCode);
      } else if (activeRoom) {
        socket.emit('join-room', { roomId: activeRoom.roomId });
        showToastRef.current('Connection restored. Rejoining your encrypted room...', 'success');
      } else if (isReconnect) {
        showToastRef.current('Connection restored.', 'success');
      } else {
        showToastRef.current('Secure session started', 'success');
      }
    };

    const handleUsernameTaken: ServerToClientEvents['username-taken'] = () => {
      showToastRef.current('Username taken. Try another!', 'error');
    };

    const handleRoomCreated: ServerToClientEvents['room-created'] = async ({
      roomId,
      roomCode,
      roomType,
    }: RoomCreatedPayload) => {
      const publicKey = encryptionRef.current?.publicKeyExported;
      if (!encryptionRef.current || !publicKey) {
        return;
      }

      await encryptionRef.current.setRoomKey(roomCode, [publicKey]);

      setCurrentRoom({
        roomId,
        roomCode,
        isOwner: true,
        memberKeys: { [usernameRef.current]: publicKey },
        roomType: normalizeRoomType(roomType),
      });
      setJoinRequests([]);
      setCurrentPage('room');

      const typeLabel =
        normalizeRoomType(roomType) === 'authenticated' ? ' (Authenticated)' : ' (Legacy)';
      showToastRef.current(`Room ${roomCode} created${typeLabel}`, 'success');
    };

    const handleJoinRequest: ServerToClientEvents['join-request'] = (request) => {
      setJoinRequests((prev) =>
        prev.some((existing) => existing.requestId === request.requestId)
          ? prev
          : [...prev, request]
      );
      showToastRef.current(`${request.username} wants to join`, 'info');
    };

    const handleJoinApproved: ServerToClientEvents['join-approved'] = async ({
      roomId,
      roomCode,
      roomType,
      memberKeys,
    }: JoinApprovedPayload) => {
      if (!encryptionRef.current) {
        return;
      }

      await encryptionRef.current.setRoomKey(roomCode, Object.values(memberKeys));

      setCurrentRoom({
        roomId,
        roomCode,
        isOwner: false,
        memberKeys,
        roomType: normalizeRoomType(roomType),
      });
      setJoinRequests([]);
      setCurrentPage('room');

      const typeLabel = normalizeRoomType(roomType) === 'authenticated' ? ' (Authenticated)' : '';
      showToastRef.current(`🔐 Joined secure room${typeLabel}`, 'success');
    };

    const handleJoinDenied: ServerToClientEvents['join-denied'] = () => {
      showToastRef.current('Join request denied', 'error');
    };

    const handleSocketError: ServerToClientEvents['error'] = ({ message }) => {
      showToastRef.current(message, 'error');
    };

    const handleRoomClosed: ServerToClientEvents['room-closed'] = () => {
      setCurrentRoom(null);
      setJoinRequests([]);
      setCurrentPage('home');
      showToastRef.current('Room was closed by owner', 'error');
    };

    socket.on('auth-expired', handleAuthExpired);
    socket.on('registered', handleRegistered);
    socket.on('username-taken', handleUsernameTaken);
    socket.on('room-created', handleRoomCreated);
    socket.on('join-request', handleJoinRequest);
    socket.on('join-approved', handleJoinApproved);
    socket.on('join-denied', handleJoinDenied);
    socket.on('error', handleSocketError);
    socket.on('room-closed', handleRoomClosed);

    return () => {
      socket.off('auth-expired', handleAuthExpired);
      socket.off('registered', handleRegistered);
      socket.off('username-taken', handleUsernameTaken);
      socket.off('room-created', handleRoomCreated);
      socket.off('join-request', handleJoinRequest);
      socket.off('join-approved', handleJoinApproved);
      socket.off('join-denied', handleJoinDenied);
      socket.off('error', handleSocketError);
      socket.off('room-closed', handleRoomClosed);
    };
  }, []);

  const handleAuth = async (user: AuthUser): Promise<void> => {
    legacySessionRef.current = false;
    setUsername(user.username);
    setIsAuthenticated(true);
    reconnectWithAuth();

    const registerAfterConnect = () => {
      if (encryptionStatus === 'ready') {
        emitRegistration(user.username);
      }

      socket.off('connect', registerAfterConnect);
    };

    if (socket.connected) {
      registerAfterConnect();
      return;
    }

    socket.on('connect', registerAfterConnect);
  };

  const handleLogout = async (): Promise<void> => {
    await authService.logout();
    clearActiveSessionState(resolveAppPage(useNewAuthRef.current));
    reconnectWithoutAuth();
    showToastRef.current('Logged out successfully', 'success');
  };

  const handleRegister = async (name: string): Promise<void> => {
    if (encryptionStatus !== 'ready') {
      showToastRef.current('Encryption initializing...', 'info');
      return;
    }

    legacySessionRef.current = true;
    usernameRef.current = name;
    setUsername(name);
    emitRegistration(name);
  };

  const handleCreateRoom = (): void => {
    socket.emit('create-room');
  };

  const handleJoinRoom = (roomCode: string): void => {
    requestJoinRoom(roomCode);
  };

  const handleApproveJoin = async ({ requestId }: { requestId: string }): Promise<void> => {
    socket.emit('approve-join', { requestId });
    setJoinRequests((prev) => prev.filter((request) => request.requestId !== requestId));
  };

  const handleDenyJoin = (requestId: string): void => {
    socket.emit('deny-join', { requestId });
    setJoinRequests((prev) => prev.filter((request) => request.requestId !== requestId));
  };

  const handleUpdateRoomKey = async (
    memberKeys: Record<string, string>
  ): Promise<void> => {
    const room = currentRoomRef.current;
    if (!room || !encryptionRef.current) {
      return;
    }

    await encryptionRef.current.setRoomKey(room.roomCode, Object.values(memberKeys));
    setCurrentRoom((prev) => (prev ? { ...prev, memberKeys } : null));
  };

  const handleLeaveRoom = (): void => {
    const room = currentRoomRef.current;
    if (room) {
      socket.emit('leave-room', { roomId: room.roomId });
    }

    setCurrentRoom(null);
    setCurrentPage('home');
  };

  const toggleAuthMode = (): void => {
    setUseNewAuth((prev) => {
      const next = !prev;
      setCurrentPage(resolveAppPage(next));
      return next;
    });
  };

  return {
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
  };
}

export default useMessengerController;
