/**
 * End-to-End Test Suite
 *
 * Tests complete user flows: Registration -> Room Creation -> Messaging
 */

const request = require('supertest');
const { io } = require('socket.io-client');
const { getApiUrl } = require('./helpers/api');
const { buildIdentity } = require('./helpers/identity');

function createAuthenticatedSocket(token) {
  return io(getApiUrl(), {
    autoConnect: false,
    auth: { token },
  });
}

function waitForEvent(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);

    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function waitForSocketConnection(socket, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, timeout);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });

    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

describe('E2E: Complete User Flow', () => {
  const userA = { email: '', token: '', username: '', socket: null };
  const userB = { email: '', token: '', username: '', socket: null };
  let roomCode = '';
  let roomId = '';

  beforeAll(() => {
    userA.email = buildIdentity('e2ea', 'test.com').email;
    userB.email = buildIdentity('e2eb', 'test.com').email;
  });

  afterAll(() => {
    if (userA.socket) userA.socket.disconnect();
    if (userB.socket) userB.socket.disconnect();
  });

  describe('Step 1: User Registration', () => {
    it('should register User A', async () => {
      const identity = buildIdentity('usera', 'test.com');
      const res = await request(getApiUrl())
        .post('/api/auth/register')
        .send({
          email: userA.email || identity.email,
          username: identity.username,
          password: 'SecurePass123',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('user');

      userA.token = res.body.accessToken;
      userA.username = res.body.user.username;
    });

    it('should register User B', async () => {
      const identity = buildIdentity('userb', 'test.com');
      const res = await request(getApiUrl())
        .post('/api/auth/register')
        .send({
          email: userB.email || identity.email,
          username: identity.username,
          password: 'SecurePass456',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');

      userB.token = res.body.accessToken;
      userB.username = res.body.user.username;
    });
  });

  describe('Step 2: Socket Connection', () => {
    it('User A should connect with auth token', async () => {
      expect(userA.token).toBeTruthy();

      userA.socket = createAuthenticatedSocket(userA.token);
      userA.socket.connect();

      await waitForSocketConnection(userA.socket);
      expect(userA.socket.connected).toBe(true);
    });

    it('User B should connect with auth token', async () => {
      expect(userB.token).toBeTruthy();

      userB.socket = createAuthenticatedSocket(userB.token);
      userB.socket.connect();

      await waitForSocketConnection(userB.socket);
      expect(userB.socket.connected).toBe(true);
    });
  });

  describe('Step 3: Room Creation', () => {
    it('User A should create a room via API', async () => {
      const res = await request(getApiUrl())
        .post('/api/rooms')
        .set('Authorization', `Bearer ${userA.token}`);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('room');
      expect(res.body.room).toHaveProperty('roomCode');
      expect(res.body.room).toHaveProperty('roomId');

      roomCode = res.body.room.roomCode;
      roomId = res.body.room.roomId;
    });

    it('Room code should be 6 characters', () => {
      expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
    });
  });

  describe('Step 4: Room Joining', () => {
    it('User A should register with socket and public key', async () => {
      expect(userA.socket).toBeTruthy();
      expect(userA.username).toBeTruthy();

      const registerPromise = waitForEvent(userA.socket, 'registered');

      userA.socket.emit('register', {
        username: userA.username,
        publicKey: `mock-public-key-a-${Date.now()}`,
      });

      const result = await registerPromise;
      expect(result).toHaveProperty('username', userA.username);
    });

    it('User A should join their room', async () => {
      expect(userA.socket).toBeTruthy();
      expect(roomId).toBeTruthy();

      const roomDataPromise = waitForEvent(userA.socket, 'room-data');
      userA.socket.emit('join-room', { roomId });

      const roomData = await roomDataPromise;
      expect(roomData).toHaveProperty('members');
      expect(roomData.members).toContain(userA.username);
    });

    it('User A should persist wrapped room key material for reconnects', async () => {
      expect(userA.socket).toBeTruthy();

      userA.socket.emit('sync-room-key', {
        roomId,
        wrappedRoomKey: 'mock-wrapped-room-key-owner',
        wrappedRoomKeyIv: 'mock-wrapped-room-iv-owner',
        keySenderUsername: userA.username,
      });

      const roomDataPromise = waitForEvent(userA.socket, 'room-data');
      userA.socket.emit('join-room', { roomId });

      const roomData = await roomDataPromise;
      expect(roomData).toHaveProperty('wrappedRoomKey', 'mock-wrapped-room-key-owner');
      expect(roomData).toHaveProperty('wrappedRoomKeyIv', 'mock-wrapped-room-iv-owner');
      expect(roomData).toHaveProperty('keySenderUsername', userA.username);
    });

    it('User B should register with socket and public key', async () => {
      expect(userB.socket).toBeTruthy();
      expect(userB.username).toBeTruthy();

      const registerPromise = waitForEvent(userB.socket, 'registered');

      userB.socket.emit('register', {
        username: userB.username,
        publicKey: `mock-public-key-b-${Date.now()}`,
      });

      const result = await registerPromise;
      expect(result).toHaveProperty('username', userB.username);
    });

    it('User B should receive wrapped room key on approval', async () => {
      expect(userA.socket).toBeTruthy();
      expect(userB.socket).toBeTruthy();

      const joinRequestPromise = waitForEvent(userA.socket, 'join-request');
      const joinApprovedPromise = waitForEvent(userB.socket, 'join-approved');

      userB.socket.emit('request-join', { roomCode });

      const joinRequest = await joinRequestPromise;
      expect(joinRequest).toHaveProperty('username', userB.username);

      userA.socket.emit('approve-join', {
        requestId: joinRequest.requestId,
        wrappedRoomKey: 'mock-wrapped-room-key-member',
        wrappedRoomKeyIv: 'mock-wrapped-room-iv-member',
        keySenderUsername: userA.username,
      });

      const joinApproved = await joinApprovedPromise;
      expect(joinApproved).toHaveProperty('roomId', roomId);
      expect(joinApproved).toHaveProperty('roomCode', roomCode);
      expect(joinApproved).toHaveProperty('wrappedRoomKey', 'mock-wrapped-room-key-member');
      expect(joinApproved).toHaveProperty('wrappedRoomKeyIv', 'mock-wrapped-room-iv-member');
      expect(joinApproved).toHaveProperty('keySenderUsername', userA.username);
    });
  });

  describe('Step 5: Message Exchange', () => {
    it('User A should send an encrypted message', async () => {
      expect(userA.socket).toBeTruthy();

      const messagePromise = waitForEvent(userA.socket, 'new-encrypted-message');
      const encryptedData = `mock-encrypted-data-${Date.now()}`;

      userA.socket.emit('send-encrypted-message', {
        roomId,
        encryptedData,
        iv: 'mock-iv-12345678',
        senderUsername: userA.username,
      });

      const message = await messagePromise;
      expect(message).toHaveProperty('senderUsername', userA.username);
      expect(message).toHaveProperty('encryptedData', encryptedData);
    });
  });

  describe('Step 6: Cleanup', () => {
    it('User A should be able to delete the room', async () => {
      const res = await request(getApiUrl())
        .delete(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(res.status).toBe(200);
    });
  });
});

describe('E2E: Security Flow', () => {
  it('should not allow unauthenticated room creation', async () => {
    const res = await request(getApiUrl())
      .post('/api/rooms');

    expect(res.status).toBe(401);
  });

  it('should surface invalid socket auth instead of silently downgrading it', async () => {
    const staleSocket = createAuthenticatedSocket('invalid-token');
    staleSocket.connect();

    try {
      await waitForSocketConnection(staleSocket);

      const authExpiredPromise = waitForEvent(staleSocket, 'auth-expired');

      staleSocket.emit('register', {
        username: `stale_${Date.now()}`,
        publicKey: `mock-public-key-${Date.now()}`,
      });

      await expect(authExpiredPromise).resolves.toBeUndefined();
    } finally {
      staleSocket.disconnect();
    }
  });

  it('should not allow access to other users rooms', async () => {
    const ownerRes = await request(getApiUrl())
      .post('/api/auth/register')
      .send({
        ...buildIdentity('sectest', 'test.com'),
        password: 'TestPass123',
      });

    expect(ownerRes.status).toBe(201);

    const roomRes = await request(getApiUrl())
      .post('/api/rooms')
      .set('Authorization', `Bearer ${ownerRes.body.accessToken}`);

    expect(roomRes.status).toBe(201);

    const otherRes = await request(getApiUrl())
      .post('/api/auth/register')
      .send({
        ...buildIdentity('other', 'test.com'),
        password: 'TestPass123',
      });

    expect(otherRes.status).toBe(201);

    const accessRes = await request(getApiUrl())
      .get(`/api/rooms/${roomRes.body.room.roomId}/messages`)
      .set('Authorization', `Bearer ${otherRes.body.accessToken}`);

    expect(accessRes.status).toBe(403);
  });
});

describe('E2E: File Upload with Encryption', () => {
  let authToken = '';
  let roomId = '';

  beforeAll(async () => {
    const res = await request(getApiUrl())
      .post('/api/auth/register')
      .send({
        ...buildIdentity('filetest', 'test.com'),
        password: 'TestPass123',
      });

    expect(res.status).toBe(201);
    authToken = res.body.accessToken;

    const roomRes = await request(getApiUrl())
      .post('/api/rooms')
      .set('Authorization', `Bearer ${authToken}`);

    expect(roomRes.status).toBe(201);
    roomId = roomRes.body.room.roomId;
  });

  it('should upload an encrypted file', async () => {
    const mockEncryptedContent = Buffer.from(`encrypted-file-content-${Date.now()}`);
    const encryptedMetadata = JSON.stringify({ encryptedData: 'mock', iv: 'mock' });

    const res = await request(getApiUrl())
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .field('roomId', roomId)
      .field('encrypted', 'true')
      .field('iv', 'mock-iv-base64-string')
      .field('metadata', encryptedMetadata)
      .field('originalName', 'secret-document.pdf')
      .field('originalType', 'application/pdf')
      .field('originalSize', '12345')
      .attach('file', mockEncryptedContent, 'encrypted.enc');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('attachment');
    expect(res.body.attachment.encrypted).toBe(true);
    expect(res.body.attachment.iv).toBeDefined();
    expect(res.body.attachment.filename).toBe('encrypted.enc');
    expect(res.body.attachment.mimetype).toBe('application/octet-stream');
    expect(res.body.attachment.size).toBe(mockEncryptedContent.length);
    expect(res.body.attachment.metadata).toBe(encryptedMetadata);
  });

  it('should retrieve encrypted file metadata', async () => {
    const res = await request(getApiUrl())
      .get(`/api/files/room/${roomId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('attachments');
    expect(Array.isArray(res.body.attachments)).toBe(true);

    const encryptedFiles = res.body.attachments.filter((attachment) => attachment.encrypted);
    expect(encryptedFiles.length).toBeGreaterThan(0);
    expect(encryptedFiles[0].iv).toBeDefined();
    expect(encryptedFiles[0].filename).toBe('encrypted.enc');
    expect(encryptedFiles[0].mimetype).toBe('application/octet-stream');
  });
});
