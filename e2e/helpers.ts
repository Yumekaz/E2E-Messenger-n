import { expect, Page } from '@playwright/test';

export interface TestUser {
  email: string;
  username: string;
  password: string;
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function buildUser(prefix: string): TestUser {
  const base = `${prefix}_${uniqueSuffix()}`.replace(/[^a-zA-Z0-9_]/g, '');
  const username = base.slice(0, 20);

  return {
    email: `${username}@example.com`,
    username,
    password: 'TestPassword123',
  };
}

export async function gotoAuthPage(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.encryption-indicator')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

export async function switchToSignUp(page: Page): Promise<void> {
  await page.getByRole('button', { name: /sign up/i }).click();
  await expect(page.getByPlaceholder(/username/i)).toBeVisible();
}

export async function registerUser(page: Page, user: TestUser): Promise<void> {
  await gotoAuthPage(page);
  await switchToSignUp(page);

  await page.getByPlaceholder('Email address').fill(user.email);
  await page.getByPlaceholder(/username/i).fill(user.username);
  await page.locator('input[type="password"]').nth(0).fill(user.password);
  await page.locator('input[type="password"]').nth(1).fill(user.password);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByRole('button', { name: /create room/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(user.username)).toBeVisible();
}

export async function loginUser(page: Page, user: TestUser, password: string = user.password): Promise<void> {
  await gotoAuthPage(page);

  await page.getByPlaceholder('Email address').fill(user.email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: /login/i }).click();
}

export async function createRoom(page: Page): Promise<string> {
  await page.getByRole('button', { name: /create room/i }).click();
  await expect(page.locator('.room-header')).toBeVisible({ timeout: 15000 });

  const roomText = await page.locator('.room-title-section h3').textContent();
  const roomCode = roomText?.match(/[A-Z0-9]{6}/)?.[0];

  if (!roomCode) {
    throw new Error(`Unable to read room code from UI: ${roomText || 'empty header'}`);
  }

  return roomCode;
}

export async function registerAndCreateRoom(page: Page, prefix: string): Promise<TestUser> {
  const user = buildUser(prefix);
  await registerUser(page, user);
  await createRoom(page);
  return user;
}
