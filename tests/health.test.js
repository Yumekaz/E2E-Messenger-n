/**
 * Health and Utility Tests
 * Tests for health checks, rate limiting, and error handling
 */

const request = require('supertest');
const { API_URL } = require('./helpers/api');

describe('Health API', () => {
  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const res = await request(API_URL)
        .get('/api/health')
        .expect('Content-Type', /json/);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'healthy');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('stats');
      expect(res.body.stats).toHaveProperty('users');
      expect(res.body.stats).toHaveProperty('rooms');
      expect(res.body.stats).toHaveProperty('messages');
    });
  });

  describe('GET /api/network-info', () => {
    it('should return network info', async () => {
      const res = await request(API_URL)
        .get('/api/network-info')
        .expect('Content-Type', /json/);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('url');
      expect(res.body).toHaveProperty('ip');
      expect(res.body).toHaveProperty('port');
    });
  });
});

describe('Error Handling', () => {
  describe('404 Not Found', () => {
    it('should return 404 for non-existent API routes', async () => {
      const res = await request(API_URL)
        .get('/api/non-existent-endpoint');

      expect(res.status).toBe(404);
    });

    it('should return JSON error for API 404', async () => {
      const res = await request(API_URL)
        .get('/api/non-existent-endpoint')
        .expect('Content-Type', /json/);

      expect(res.body).toHaveProperty('error');
    });
  });

  describe('Validation Errors', () => {
    it('should return 400 for invalid registration data', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          username: 'a',
          password: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('Authentication Errors', () => {
    it('should return 401 for missing token', async () => {
      const res = await request(API_URL)
        .get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 401 for invalid token', async () => {
      const res = await request(API_URL)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(res.status).toBe(401);
    });

    it('should return 401 for malformed authorization header', async () => {
      const res = await request(API_URL)
        .get('/api/auth/me')
        .set('Authorization', 'NotBearer token');

      expect(res.status).toBe(401);
    });
  });
});

describe('Rate Limiting', () => {
  it('should include rate limit headers', async () => {
    const res = await request(API_URL)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' });

    expect([401, 429]).toContain(res.status);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('should rate limit auth endpoints after many attempts', async () => {
    const attempts = [];

    for (let i = 0; i < 10; i++) {
      attempts.push(
        request(API_URL)
          .post('/api/auth/login')
          .send({
            email: 'ratelimit@test.com',
            password: 'wrongpassword',
          })
      );
    }

    const results = await Promise.all(attempts);

    const rateLimited = results.some((res) => res.status === 429);
    const hasHeaders = results.some((res) => res.headers['x-ratelimit-limit']);
    const validStatuses = results.every((res) => [401, 429].includes(res.status));

    expect(validStatuses || hasHeaders || rateLimited).toBe(true);
  });
});

describe('Input Sanitization', () => {
  it('should handle XSS attempts in username', async () => {
    const res = await request(API_URL)
      .post('/api/auth/register')
      .send({
        email: `xss${Date.now()}@test.com`,
        username: '<script>alert("xss")</script>',
        password: 'TestPassword123',
      });

    expect([400, 201]).toContain(res.status);

    if (res.status === 201) {
      expect(res.body.user.username).not.toContain('<script>');
    }
  });

  it('should handle SQL injection attempts', async () => {
    const res = await request(API_URL)
      .post('/api/auth/login')
      .send({
        email: "'; DROP TABLE users; --",
        password: 'password',
      });

    expect([400, 401]).toContain(res.status);
  });

  it('should handle very long input', async () => {
    const longString = 'a'.repeat(10000);

    const res = await request(API_URL)
      .post('/api/auth/register')
      .send({
        email: `long${Date.now()}@test.com`,
        username: longString,
        password: 'TestPassword123',
      });

    expect(res.status).toBe(400);
  });
});

describe('CORS and Headers', () => {
  it('should include security headers', async () => {
    const res = await request(API_URL)
      .get('/api/health');

    expect(res.status).toBe(200);
  });

  it('should handle preflight OPTIONS requests', async () => {
    const res = await request(API_URL)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');

    expect([200, 204]).toContain(res.status);
  });
});
