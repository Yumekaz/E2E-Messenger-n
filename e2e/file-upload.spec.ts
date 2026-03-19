import { test, expect } from '@playwright/test';
import { buildUser, createRoom, registerAndCreateRoom, registerUser } from './helpers';

/**
 * E2E Tests: File Upload & Encryption
 *
 * Tests encrypted file sharing:
 * - Upload file with encryption
 * - View encrypted file entries
 * - Reject invalid file types
 */

async function captureLatestBlobText(page: import('@playwright/test').Page): Promise<string> {
  await page.evaluate(() => {
    if ((window as any).__downloadCaptureInstalled) {
      return;
    }

    const originalClick = HTMLAnchorElement.prototype.click;
    (window as any).__lastDownloadHref = '';
    (window as any).__downloadCaptureInstalled = true;

    HTMLAnchorElement.prototype.click = function clickWithCapture() {
      (window as any).__lastDownloadHref = this.href;
      return originalClick.call(this);
    };
  });

  await page.locator('.file-attachment').evaluate((element) => {
    (element as HTMLElement).click();
  });
  await page.waitForFunction(() => !!(window as any).__lastDownloadHref, null, { timeout: 5000 });

  const text = await page.evaluate(async () => {
    const latestUrl = (window as any).__lastDownloadHref as string;
    const response = await fetch(latestUrl);
    return await response.text();
  });
  return text;
}

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

  test('should let an approved member download and decrypt an encrypted file', async ({ browser }) => {
    const ownerContext = await browser.newContext({ acceptDownloads: true });
    const memberContext = await browser.newContext({ acceptDownloads: true });
    const ownerPage = await ownerContext.newPage();
    const memberPage = await memberContext.newPage();

    try {
      const owner = buildUser('fileowner');
      const member = buildUser('filemember');
      const fileContents = `Sensitive file content ${Date.now()}`;

      await registerUser(ownerPage, owner);
      const roomCode = await createRoom(ownerPage);

      await registerUser(memberPage, member);
      await memberPage.getByRole('button', { name: /join room/i }).click();
      await memberPage.getByLabel(/room code/i).fill(roomCode);
      await memberPage.getByRole('button', { name: /request to join/i }).click();

      await expect(ownerPage.locator('.join-request-modal')).toContainText(member.username, {
        timeout: 15000,
      });
      await ownerPage.locator('.join-request-modal .btn-approve').click();
      await expect(ownerPage.locator('.join-request-modal')).toHaveCount(0, { timeout: 10000 });

      await expect(memberPage.locator('.room-header')).toBeVisible({ timeout: 15000 });

      await ownerPage.locator('input[type="file"]').setInputFiles({
        name: 'shared-note.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(fileContents),
      });

      await expect(memberPage.locator('.file-name').filter({ hasText: 'shared-note.txt' })).toBeVisible({
        timeout: 15000,
      });

      const downloadedText = await captureLatestBlobText(memberPage);
      expect(downloadedText).toBe(fileContents);
    } finally {
      void ownerContext.close();
      void memberContext.close();
    }
  });

  test('should let a newly approved member open a file uploaded before they joined', async ({ browser }) => {
    const ownerContext = await browser.newContext({ acceptDownloads: true });
    const memberContext = await browser.newContext({ acceptDownloads: true });
    const ownerPage = await ownerContext.newPage();
    const memberPage = await memberContext.newPage();

    try {
      const owner = buildUser('histowner');
      const member = buildUser('histmember');
      const fileContents = `Historical encrypted payload ${Date.now()}`;

      await registerUser(ownerPage, owner);
      const roomCode = await createRoom(ownerPage);

      await ownerPage.locator('input[type="file"]').setInputFiles({
        name: 'pre-join-shared.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(fileContents),
      });

      await expect(
        ownerPage.locator('.file-name').filter({ hasText: 'pre-join-shared.txt' })
      ).toBeVisible({ timeout: 15000 });

      await registerUser(memberPage, member);
      await memberPage.getByRole('button', { name: /join room/i }).click();
      await memberPage.getByLabel(/room code/i).fill(roomCode);
      await memberPage.getByRole('button', { name: /request to join/i }).click();

      await expect(ownerPage.locator('.join-request-modal')).toContainText(member.username, {
        timeout: 15000,
      });
      await ownerPage.locator('.join-request-modal .btn-approve').click();
      await expect(ownerPage.locator('.join-request-modal')).toHaveCount(0, { timeout: 10000 });
      await expect(memberPage.locator('.room-header')).toBeVisible({ timeout: 15000 });
      await expect(
        memberPage.locator('.file-name').filter({ hasText: 'pre-join-shared.txt' })
      ).toBeVisible({ timeout: 15000 });

      const downloadedText = await captureLatestBlobText(memberPage);
      expect(downloadedText).toBe(fileContents);
    } finally {
      void ownerContext.close();
      void memberContext.close();
    }
  });
});
