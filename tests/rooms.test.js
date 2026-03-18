/**
 * Room API Tests
 * Tests for room creation, membership, and management
 */

const request = require('supertest');
const { API_URL } = require('./helpers/api');
const { buildIdentity } = require('./helpers/identity');

describe('Room API', () => {
  let accessToken;
  let roomId;
  let roomCode;

  beforeAll(async () => {
    const identity = buildIdentity('roomuser');

    const regRes = await request(API_URL)
      .post('/api/auth/register')
      .send(identity);

    expect(regRes.status).toBe(201);
    accessToken = regRes.body.accessToken;

    const roomRes = await request(API_URL)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(roomRes.status).toBe(201);
    roomId = roomRes.body.room.roomId;
    roomCode = roomRes.body.room.roomCode;
  });

  describe('POST /api/rooms', () => {
    it('should create a new room when authenticated', async () => {
      const res = await request(API_URL)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('room');
      expect(res.body.room).toHaveProperty('roomId');
      expect(res.body.room).toHaveProperty('roomCode');
      expect(res.body.room.roomCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(res.body.room.isOwner).toBe(true);
    });

    it('should reject room creation without token', async () => {
      const res = await request(API_URL)
        .post('/api/rooms');

      expect(res.status).toBe(401);
    });

    it('should reject room creation with invalid token', async () => {
      const res = await request(API_URL)
        .post('/api/rooms')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/rooms/my-rooms', () => {
    it('should return user rooms', async () => {
      const res = await request(API_URL)
        .get('/api/rooms/my-rooms')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('rooms');
      expect(Array.isArray(res.body.rooms)).toBe(true);

      const createdRoom = res.body.rooms.find((room) => room.roomCode === roomCode);
      expect(createdRoom).toBeDefined();
    });

    it('should reject without authentication', async () => {
      const res = await request(API_URL)
        .get('/api/rooms/my-rooms');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/rooms/code/:roomCode', () => {
    it('should return room by code', async () => {
      const res = await request(API_URL)
        .get(`/api/rooms/code/${roomCode}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('room');
      expect(res.body.room.roomCode).toBe(roomCode);
    });

    it('should return 404 for non-existent room', async () => {
      const res = await request(API_URL)
        .get('/api/rooms/code/ZZZZZZ')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/rooms/:roomId/members', () => {
    it('should return room members', async () => {
      const res = await request(API_URL)
        .get(`/api/rooms/${roomId}/members`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('members');
      expect(Array.isArray(res.body.members)).toBe(true);
    });

    it('should reject for non-members', async () => {
      const regRes = await request(API_URL)
        .post('/api/auth/register')
        .send(buildIdentity('nonmemb'));

      expect(regRes.status).toBe(201);

      const res = await request(API_URL)
        .get(`/api/rooms/${roomId}/members`)
        .set('Authorization', `Bearer ${regRes.body.accessToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/rooms/:roomId/messages', () => {
    it('should return room messages', async () => {
      const res = await request(API_URL)
        .get(`/api/rooms/${roomId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('messages');
      expect(Array.isArray(res.body.messages)).toBe(true);
    });

    it('should support limit parameter', async () => {
      const res = await request(API_URL)
        .get(`/api/rooms/${roomId}/messages?limit=10`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBeLessThanOrEqual(10);
    });
  });

  describe('DELETE /api/rooms/:roomId', () => {
    it('should delete room when owner', async () => {
      const createRes = await request(API_URL)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(createRes.status).toBe(201);

      const res = await request(API_URL)
        .delete(`/api/rooms/${createRes.body.room.roomId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Room deleted');
    });

    it('should reject deletion by non-owner', async () => {
      const regRes = await request(API_URL)
        .post('/api/auth/register')
        .send(buildIdentity('deleter'));

      expect(regRes.status).toBe(201);

      const res = await request(API_URL)
        .delete(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${regRes.body.accessToken}`);

      expect([403, 404]).toContain(res.status);
    });
  });
});
