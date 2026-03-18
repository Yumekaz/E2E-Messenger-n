/**
 * End-to-End Test Suite
 *
 * Tests complete user flows: Registration -> Room Creation -> Messaging
 */

const request = require('supertest');
const { io } = require('socket.io-client');
const { API_URL } = require('./helpers/api');
const { buildIdentity } = require('./helpers/identity');

function createAuthenticatedSocket(token) {
  return io(API_URL, {
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
      const res = await request(API_URL)
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
      const res = await request(API_URL)
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
      const res = await request(API_URL)
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
      const res = await request(API_URL)
        .delete(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(res.status).toBe(200);
    });
  });
});

describe('E2E: Security Flow', () => {
  it('should not allow unauthenticated room creation', async () => {
    const res = await request(API_URL)
      .post('/api/rooms');

    expect(res.status).toBe(401);
  });

  it('should not allow access to other users rooms', async () => {
    const ownerRes = await request(API_URL)
      .post('/api/auth/register')
      .send({
        ...buildIdentity('sectest', 'test.com'),
        password: 'TestPass123',
      });

    expect(ownerRes.status).toBe(201);

    const roomRes = await request(API_URL)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${ownerRes.body.accessToken}`);

    expect(roomRes.status).toBe(201);

    const otherRes = await request(API_URL)
      .post('/api/auth/register')
      .send({
        ...buildIdentity('other', 'test.com'),
        password: 'TestPass123',
      });

    expect(otherRes.status).toBe(201);

    const accessRes = await request(API_URL)
      .get(`/api/rooms/${roomRes.body.room.roomId}/messages`)
      .set('Authorization', `Bearer ${otherRes.body.accessToken}`);

    expect(accessRes.status).toBe(403);
  });
});

describe('E2E: File Upload with Encryption', () => {
  let authToken = '';
  let roomId = '';

  beforeAll(async () => {
    const res = await request(API_URL)
      .post('/api/auth/register')
      .send({
        ...buildIdentity('filetest', 'test.com'),
        password: 'TestPass123',
      });

    expect(res.status).toBe(201);
    authToken = res.body.accessToken;

    const roomRes = await request(API_URL)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${authToken}`);

    expect(roomRes.status).toBe(201);
    roomId = roomRes.body.room.roomId;
  });

  it('should upload an encrypted file', async () => {
    const mockEncryptedContent = Buffer.from(`encrypted-file-content-${Date.now()}`);

    const res = await request(API_URL)
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .field('roomId', roomId)
      .field('encrypted', 'true')
      .field('iv', 'mock-iv-base64-string')
      .field('metadata', JSON.stringify({ encryptedData: 'mock', iv: 'mock' }))
      .field('originalName', 'secret-document.pdf')
      .field('originalType', 'application/pdf')
      .field('originalSize', '12345')
      .attach('file', mockEncryptedContent, 'encrypted.enc');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('attachment');
    expect(res.body.attachment.encrypted).toBe(true);
    expect(res.body.attachment.iv).toBeDefined();
  });

  it('should retrieve encrypted file metadata', async () => {
    const res = await request(API_URL)
      .get(`/api/files/room/${roomId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('attachments');
    expect(Array.isArray(res.body.attachments)).toBe(true);

    const encryptedFiles = res.body.attachments.filter((attachment) => attachment.encrypted);
    expect(encryptedFiles.length).toBeGreaterThan(0);
    expect(encryptedFiles[0].iv).toBeDefined();
  });
});
