/**
 * Authentication Service
 * Handles user authentication, token storage, and API calls
 */

import type { AuthUser, AuthResponse, LoginCredentials, RegisterCredentials } from '../types';
import { setSocketAuthToken } from '../socket';

const API_BASE = '/api/auth';

class AuthService {
  private accessToken: string | null;
  private refreshToken: string | null;
  private user: AuthUser | null;

  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
    const userJson = localStorage.getItem('user');
    this.user = userJson ? JSON.parse(userJson) : null;
  }

  /**
   * Register a new user
   */
  async register(email: string, username: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password } as RegisterCredentials),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.details?.[0] || 'Registration failed');
    }

    const data: AuthResponse = await response.json();
    this.setTokens(data.accessToken, data.refreshToken);
    this.setUser(data.user);

    return data;
  }

  /**
   * Login user
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password } as LoginCredentials),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const data: AuthResponse = await response.json();
    this.setTokens(data.accessToken, data.refreshToken);
    this.setUser(data.user);

    return data;
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<AuthResponse> {
    if (!this.refreshToken) {
      throw new Error('No refresh token');
    }

    const response = await fetch(`${API_BASE}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });

    if (!response.ok) {
      this.clearSession();
      throw new Error('Session expired');
    }

    const data: AuthResponse = await response.json();
    this.setTokens(data.accessToken, data.refreshToken);

    return data;
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    if (this.refreshToken) {
      try {
        await fetch(`${API_BASE}/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });
      } catch {
        // Ignore logout errors
      }
    }

    this.clearSession();
  }

  /**
   * Logout from all devices
   */
  async logoutAll(): Promise<void> {
    try {
      await this.authenticatedFetch(`${API_BASE}/logout-all`, {
        method: 'POST',
      });
    } finally {
      this.clearSession();
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<AuthUser> {
    const response = await this.authenticatedFetch(`${API_BASE}/me`);
    const data = await response.json();
    this.setUser(data.user);
    return data.user;
  }

  /**
   * Make authenticated API request with auto token refresh
   */
  async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const headers: HeadersInit = {
      ...options.headers,
      Authorization: `Bearer ${this.accessToken}`,
    };

    let response = await fetch(url, { ...options, headers });

    // If unauthorized, try to refresh token
    if (response.status === 401) {
      try {
        await this.refreshAccessToken();
        (headers as Record<string, string>).Authorization = `Bearer ${this.accessToken}`;
        response = await fetch(url, { ...options, headers });
      } catch {
        this.clearSession();
        throw new Error('Session expired');
      }
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Request failed');
    }

    return response;
  }

  /**
   * Store tokens
   */
  private setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setSocketAuthToken(accessToken);
  }

  /**
   * Store user data
   */
  private setUser(user: AuthUser): void {
    this.user = user;
    localStorage.setItem('user', JSON.stringify(user));
  }

  /**
   * Clear session data
   */
  private clearSession(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setSocketAuthToken(null);
  }

  /**
   * Get stored access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get stored user
   */
  getUser(): AuthUser | null {
    return this.user;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.accessToken;
  }
}

// Export singleton instance
const authService = new AuthService();
export default authService;
