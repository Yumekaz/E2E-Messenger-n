import { test, expect } from '@playwright/test';
import { gotoAuthPage, loginUser, registerUser, type TestUser } from './helpers';

/**
 * E2E Tests: Authentication Flow
 *
 * Tests the complete authentication journey:
 * - Registration
 * - Login
 * - Logout
 * - Validation errors
 */

const timestamp = Date.now();
const testUser: TestUser = {
  email: `e2e_test_${timestamp}@example.com`,
  username: `e2euser${timestamp}`.slice(0, 20),
  password: 'TestPassword123',
};

test.describe('Authentication Flow', () => {
  test.describe.configure({ mode: 'serial' });

  test('should show login page by default', async ({ page }) => {
    await gotoAuthPage(page);

    await expect(page.getByRole('heading', { name: 'SecureChat' })).toBeVisible();
    await expect(page.getByRole('button', { name: /login/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign up/i })).toBeVisible();
  });

  test('should register a new user', async ({ page }) => {
    await registerUser(page, testUser);
  });

  test('should logout successfully', async ({ page }) => {
    await loginUser(page, testUser);
    await expect(page.getByRole('button', { name: /create room/i })).toBeVisible({ timeout: 15000 });

    await page.locator('.logout-btn').click();

    await expect(page.getByRole('heading', { name: 'SecureChat' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /login/i })).toBeVisible();
  });

  test('should login with existing user', async ({ page }) => {
    await loginUser(page, testUser);

    await expect(page.getByRole('button', { name: /create room/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(testUser.username)).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await loginUser(page, testUser, 'wrongpassword123');

    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.error-message')).toContainText(/invalid/i);
  });

  test('should validate registration fields', async ({ page }) => {
    await gotoAuthPage(page);
    await page.getByRole('button', { name: /sign up/i }).click();

    await page.getByPlaceholder('Email address').fill(`mismatch_${Date.now()}@example.com`);
    await page.getByPlaceholder(/username/i).fill(`mismatch_${Date.now()}`.slice(0, 20));
    await page.locator('input[type="password"]').nth(0).fill(testUser.password);
    await page.locator('input[type="password"]').nth(1).fill('DifferentPassword123');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.locator('.error-message')).toContainText(/passwords do not match/i);
  });
});
