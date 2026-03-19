import { test, expect } from '@playwright/test';
import { registerAndCreateRoom } from './helpers';

/**
 * E2E Tests: File Upload & Encryption
 *
 * Tests encrypted file sharing:
 * - Upload file with encryption
 * - View encrypted file entries
 * - Reject invalid file types
 */

test.describe('File Upload & Encryption', () => {
  test('should show file upload button with encryption badge', async ({ page }) => {
    await registerAndCreateRoom(page, 'filebadge');

    await expect(page.locator('.file-upload-btn, button[title*="file" i]')).toBeVisible();
    await expect(page.locator('.encryption-badge')).toBeVisible();
  });

  test('should open file picker on click', async ({ page }) => {
    await registerAndCreateRoom(page, 'fileinput');

    await expect(page.locator('input[type="file"]')).toBeAttached();
  });

  test('should upload a text file', async ({ page }) => {
    await registerAndCreateRoom(page, 'filetext');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'test-document.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This is a test file for E2E encryption testing.'),
    });

    await expect(page.locator('.file-attachment')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Shared encrypted file: test-document.txt')).toBeVisible({ timeout: 10000 });
  });

  test('should complete encrypted uploads successfully', async ({ page }) => {
    await registerAndCreateRoom(page, 'fileprogress');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'large-file.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('X'.repeat(10000)),
    });

    await expect(page.locator('.file-attachment')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.file-name').filter({ hasText: 'large-file.txt' })).toBeVisible({ timeout: 10000 });
  });

  test('should display uploaded images as encrypted file attachments', async ({ page }) => {
    await registerAndCreateRoom(page, 'fileimage');

    const pngBuffer = Buffer.from([
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

    await page.locator('input[type="file"]').setInputFiles({
      name: 'test-image.png',
      mimeType: 'image/png',
      buffer: pngBuffer,
    });

    await expect(page.locator('.file-attachment')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.file-name').filter({ hasText: 'test-image.png' })).toBeVisible({ timeout: 10000 });
  });

  test('should reject invalid file types', async ({ page }) => {
    await registerAndCreateRoom(page, 'fileinvalid');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'malicious.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('fake executable content'),
    });

    await page.waitForTimeout(500);
    await expect(page.locator('.file-upload-error')).toContainText(/file type not allowed/i);
    await expect(page.locator('.file-attachment')).toHaveCount(0);
  });
});

test.describe('File Security', () => {
  test('should show encrypted file messages in chat', async ({ page }) => {
    await registerAndCreateRoom(page, 'filesecure');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'secret-document.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Confidential information'),
    });

    await expect(page.getByText('Shared encrypted file: secret-document.txt')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.file-attachment')).toBeVisible({ timeout: 10000 });
  });

  test('should show encryption indicators for file sharing', async ({ page }) => {
    await registerAndCreateRoom(page, 'filelock');

    await expect(page.locator('.encryption-badge')).toBeVisible();
    await expect(
      page.getByText(/messages and files are end-to-end encrypted/i)
    ).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'encrypted-file.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Encrypted content'),
    });

    await expect(page.locator('.encrypted-badge')).toBeVisible({ timeout: 10000 });
  });
});
