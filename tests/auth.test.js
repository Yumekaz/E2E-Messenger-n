/**
 * Authentication Tests
 * Tests for user registration, login, and token management
 */

const request = require('supertest');
const { getApiUrl } = require('./helpers/api');
const { buildIdentity } = require('./helpers/identity');

describe('Authentication API', () => {
  let accessToken;
  let refreshToken;
  let seededUser;

  beforeAll(async () => {
    seededUser = buildIdentity('authseed');

    const res = await request(getApiUrl())
      .post('/api/auth/register')
      .send(seededUser)
      .expect('Content-Type', /json/);

    expect(res.status).toBe(201);

    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const testUser = buildIdentity('register');

      const res = await request(getApiUrl())
        .post('/api/auth/register')
        .send(testUser)
        .expect('Content-Type', /json/);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user).not.toHaveProperty('password_hash');
    });

    it('should reject registration with invalid email', async () => {
      const res = await request(getApiUrl())
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          username: 'testuser',
          password: 'TestPassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject registration with short password', async () => {
      const res = await request(getApiUrl())
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          username: 'testuser',
          password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject registration with invalid username', async () => {
      const res = await request(getApiUrl())
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          username: 'ab',
          password: 'TestPassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(getApiUrl())
        .post('/api/auth/login')
        .send({
          email: seededUser.email,
          password: seededUser.password,
        })
        .expect('Content-Type', /json/);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('user');
    });

    it('should reject login with wrong password', async () => {
      const res = await request(getApiUrl())
        .post('/api/auth/login')
        .send({
          email: seededUser.email,
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(getApiUrl())
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPassword123',
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh access token', async () => {
      const res = await request(getApiUrl())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect('Content-Type', /json/);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(getApiUrl())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user profile', async () => {
      const res = await request(getApiUrl())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect('Content-Type', /json/);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('username', seededUser.username);
      expect(res.body.user).not.toHaveProperty('password_hash');
    });

    it('should reject request without token', async () => {
      const res = await request(getApiUrl())
        .get('/api/auth/me');

      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const res = await request(getApiUrl())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });
});

describe('Rate Limiting', () => {
  it('should rate limit excessive login attempts', async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        request(getApiUrl())
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword',
          })
      );
    }

    const results = await Promise.all(promises);

    const rateLimited = results.some((res) => res.status === 429);
    const hasRateLimitHeaders = results.some((res) => res.headers['x-ratelimit-limit']);

    expect(rateLimited || hasRateLimitHeaders).toBe(true);
  });
});
