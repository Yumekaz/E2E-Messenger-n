import { test, expect, Page } from '@playwright/test';
import { buildUser, createRoom, registerUser } from './helpers';

/**
 * E2E Tests: Room & Messaging Flow
 *
 * Tests the complete chat experience:
 * - Create room
 * - Send encrypted messages
 * - Room info display
 * - Leave room
 */

async function registerAndEnterRoom(page: Page, prefix: string): Promise<string> {
  const user = buildUser(prefix);
  await registerUser(page, user);
  return createRoom(page);
}

test.describe('Room & Messaging Flow', () => {
  test.describe.configure({ mode: 'serial' });

  test('should create a new encrypted room', async ({ page }) => {
    const roomCode = await registerAndEnterRoom(page, 'roomcreate');

    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
    await expect(page.locator('.room-title-section h3')).toContainText(roomCode);
  });

  test('should display encryption info', async ({ page }) => {
    await registerAndEnterRoom(page, 'roominfo');

    await page.getByRole('button', { name: /room info/i }).click();

    await expect(page.getByText('AES-256-GCM')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('ECDH P-256')).toBeVisible();
  });

  test('should send and receive encrypted messages', async ({ page }) => {
    await registerAndEnterRoom(page, 'roommsg');

    const messageInput = page.locator('.message-input');
    await messageInput.fill('Hello, this is an encrypted test message!');
    await page.click('.btn-send, button[type="submit"]');

    await expect(page.locator('text=Hello, this is an encrypted test message!')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.encrypted-badge')).toBeVisible();
  });

  test('should show encryption banner', async ({ page }) => {
    await registerAndEnterRoom(page, 'roombanner');

    await expect(
      page.getByText(/messages and files are end-to-end encrypted/i)
    ).toBeVisible();
  });

  test('should display QR code for mobile joining', async ({ page }) => {
    await registerAndEnterRoom(page, 'roomqr');

    await page.getByRole('button', { name: /room info/i }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 });
  });

  test('should show members panel', async ({ page }) => {
    const user = buildUser('roommembers');
    await registerUser(page, user);
    await createRoom(page);

    await page.getByRole('button', { name: /members/i }).click();

    await expect(page.locator('.members-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(user.username)).toBeVisible();
    await expect(page.getByText('You')).toBeVisible();
  });

  test('should confirm before leaving room as owner', async ({ page }) => {
    await registerAndEnterRoom(page, 'roomleaveconfirm');

    await page.locator('.btn-leave').click();

    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: /close room/i })).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.locator('.room-header')).toBeVisible();
  });

  test('should leave room and return to home', async ({ page }) => {
    await registerAndEnterRoom(page, 'roomleave');

    await page.locator('.btn-leave').click();
    await page.locator('.modal-actions').getByRole('button', { name: /close room|leave/i }).click();

    await expect(page.getByRole('button', { name: /create room/i })).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Join Room Flow', () => {
  test('should show join room form', async ({ page }) => {
    const user = buildUser('join');
    await registerUser(page, user);

    await page.getByRole('button', { name: /join room/i }).click();
    await expect(page.locator('.code-input')).toBeVisible({ timeout: 5000 });
  });

  test('should validate room code format', async ({ page }) => {
    const user = buildUser('validate');
    await registerUser(page, user);

    await page.getByRole('button', { name: /join room/i }).click();

    const codeInput = page.locator('.code-input');
    const submitBtn = page.getByRole('button', { name: /request to join/i });

    await codeInput.fill('ABC');
    await expect(submitBtn).toBeDisabled();

    await codeInput.fill('ABCDEF');
    await expect(submitBtn).toBeEnabled();
  });
});
