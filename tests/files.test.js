/**
 * File Upload API Tests
 * Tests for file upload, retrieval, and validation
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { getApiUrl } = require('./helpers/api');
const { buildIdentity } = require('./helpers/identity');

describe('File Upload API', () => {
  let accessToken;
  let roomId;
  let uploadedFileId;
  let encryptedFileId;

  const testFilePath = path.join(__dirname, 'test-file.txt');
  const testImagePath = path.join(__dirname, 'test-image.png');
  const testFileContents = 'This is a test file for upload testing.';

  beforeAll(async () => {
    fs.writeFileSync(testFilePath, testFileContents);

    const minimalPNG = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
      0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
      0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
      0x44, 0xAE, 0x42, 0x60, 0x82,
    ]);
    fs.writeFileSync(testImagePath, minimalPNG);

    const regRes = await request(getApiUrl())
      .post('/api/auth/register')
      .send(buildIdentity('fileuser'));

    expect(regRes.status).toBe(201);
    accessToken = regRes.body.accessToken;

    const roomRes = await request(getApiUrl())
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(roomRes.status).toBe(201);
    roomId = roomRes.body.room.roomId;
  });

  afterAll(() => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }

    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  describe('POST /api/files/upload', () => {
    it('should upload a text file', async () => {
      const res = await request(getApiUrl())
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('roomId', roomId)
        .attach('file', testFilePath);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('attachment');
      expect(res.body.attachment).toHaveProperty('id');
      expect(res.body.attachment).toHaveProperty('filename');
      expect(res.body.attachment).toHaveProperty('url');
      expect(res.body.attachment).toHaveProperty('size');
      expect(res.body.attachment).toHaveProperty('mimetype');
      expect(res.body.attachment.mimetype).toBe('text/plain');

      uploadedFileId = res.body.attachment.id;
    });

    it('should upload an image file', async () => {
      const res = await request(getApiUrl())
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('roomId', roomId)
        .attach('file', testImagePath);

      expect(res.status).toBe(201);
      expect(res.body.attachment.mimetype).toBe('image/png');
    });

    it('should ignore plaintext metadata fields for encrypted uploads', async () => {
      const encryptedPayload = Buffer.from(`encrypted-file-${Date.now()}`);
      const encryptedMetadata = JSON.stringify({ encryptedData: 'ciphertext', iv: 'metadata-iv' });

      const res = await request(getApiUrl())
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('roomId', roomId)
        .field('encrypted', 'true')
        .field('iv', 'file-iv')
        .field('metadata', encryptedMetadata)
        .field('originalName', 'secret-document.pdf')
        .field('originalType', 'application/pdf')
        .field('originalSize', '12345')
        .attach('file', encryptedPayload, 'encrypted.enc');

      expect(res.status).toBe(201);
      expect(res.body.attachment.encrypted).toBe(true);
      expect(res.body.attachment.filename).toBe('encrypted.enc');
      expect(res.body.attachment.mimetype).toBe('application/octet-stream');
      expect(res.body.attachment.size).toBe(encryptedPayload.length);
      expect(res.body.attachment.metadata).toBe(encryptedMetadata);

      encryptedFileId = res.body.attachment.id;
    });

    it('should reject upload without authentication', async () => {
      const res = await request(getApiUrl())
        .post('/api/files/upload')
        .field('roomId', roomId)
        .attach('file', testFilePath);

      expect(res.status).toBe(401);
    });

    it('should reject upload without roomId', async () => {
      const res = await request(getApiUrl())
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', testFilePath);

      expect(res.status).toBe(400);
    });

    it('should reject upload without file', async () => {
      const res = await request(getApiUrl())
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('roomId', roomId);

      expect(res.status).toBe(400);
    });

    it('should reject upload for non-member room', async () => {
      const res = await request(getApiUrl())
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('roomId', 'non-existent-room')
        .attach('file', testFilePath);

      expect([400, 403, 404]).toContain(res.status);
    });
  });

  describe('GET /api/files/:id', () => {
    it('should stream the uploaded file', async () => {
      expect(uploadedFileId).toBeDefined();

      const res = await request(getApiUrl())
        .get(`/api/files/${uploadedFileId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.text).toBe(testFileContents);
    });

    it('should reject for non-existent file', async () => {
      const res = await request(getApiUrl())
        .get('/api/files/999999')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/files/room/:roomId', () => {
    it('should get all files in room', async () => {
      const res = await request(getApiUrl())
        .get(`/api/files/room/${roomId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('attachments');
      expect(Array.isArray(res.body.attachments)).toBe(true);

      const uploadedFile = res.body.attachments.find((file) => file.id === uploadedFileId);
      expect(uploadedFile).toBeDefined();

      const encryptedFile = res.body.attachments.find((file) => file.id === encryptedFileId);
      expect(encryptedFile).toBeDefined();
      expect(encryptedFile.filename).toBe('encrypted.enc');
      expect(encryptedFile.mimetype).toBe('application/octet-stream');
      expect(encryptedFile.size).toBeGreaterThan(0);
      expect(encryptedFile.metadata).toBeDefined();
    });

    it('should reject for non-member', async () => {
      const regRes = await request(getApiUrl())
        .post('/api/auth/register')
        .send(buildIdentity('filenon'));

      expect(regRes.status).toBe(201);

      const res = await request(getApiUrl())
        .get(`/api/files/room/${roomId}`)
        .set('Authorization', `Bearer ${regRes.body.accessToken}`);

      expect(res.status).toBe(403);
    });
  });
});

describe('File Validation', () => {
  let accessToken;
  let roomId;

  beforeAll(async () => {
    const regRes = await request(getApiUrl())
      .post('/api/auth/register')
      .send(buildIdentity('fileval'));

    expect(regRes.status).toBe(201);
    accessToken = regRes.body.accessToken;

    const roomRes = await request(getApiUrl())
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(roomRes.status).toBe(201);
    roomId = roomRes.body.room.roomId;
  });

  it('should reject files that are too large', async () => {
    const largeFilePath = path.join(__dirname, 'large-test-file.txt');

    try {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'x');
      fs.writeFileSync(largeFilePath, largeBuffer);

      const res = await request(getApiUrl())
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('roomId', roomId)
        .attach('file', largeFilePath);

      expect([400, 413]).toContain(res.status);
    } finally {
      if (fs.existsSync(largeFilePath)) {
        fs.unlinkSync(largeFilePath);
      }
    }
  });

  it('should reject invalid file types', async () => {
    const invalidFilePath = path.join(__dirname, 'test.exe');
    fs.writeFileSync(invalidFilePath, 'fake executable content');

    try {
      const res = await request(getApiUrl())
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('roomId', roomId)
        .attach('file', invalidFilePath);

      expect(res.status).toBe(400);
    } finally {
      if (fs.existsSync(invalidFilePath)) {
        fs.unlinkSync(invalidFilePath);
      }
    }
  });
});
