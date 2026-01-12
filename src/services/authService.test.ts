import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { authService } from '../../services/authService';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('authService', () => {
  beforeEach(() => {
    // Reset authService state
    authService.logout();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login', () => {
    it('should successfully login and store token', async () => {
      const mockResponse = {
        accessToken: 'mock.jwt.token',
        user: { id: '123', role: 'user' }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await authService.login('mock_init_data');

      expect(result).toEqual(mockResponse);
      expect(authService.getAccessToken()).toBe('mock.jwt.token');
    });

    it('should throw error on failed login', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized'
      });

      await expect(authService.login('invalid_data')).rejects.toThrow('Authentication failed');
    });
  });

  describe('isTokenExpired', () => {
    it('should return true when no token exists', () => {
      expect(authService.isTokenExpired()).toBe(true);
    });

    it('should return true for expired token', () => {
      // Mock an expired token (exp in the past)
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      vi.spyOn(authService as any, 'getAccessToken').mockReturnValue(expiredToken);

      expect(authService.isTokenExpired()).toBe(true);
    });

    it('should return false for valid token', () => {
      // Mock a valid token (exp in the future)
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjIwMDAwMDAwMDB9.mLQjHEQ8VrKLapLp5W6qk8KQG2P0Y8Q2QpCz3G1jXGg';
      vi.spyOn(authService as any, 'getAccessToken').mockReturnValue(validToken);

      expect(authService.isTokenExpired()).toBe(false);
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      // First set up initial state
      const initialResponse = {
        accessToken: 'initial.token',
        user: { id: '123', role: 'user' }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(initialResponse)
      });

      await authService.login('init_data');

      // Now test refresh
      const refreshResponse = {
        accessToken: 'refreshed.token',
        user: { id: '123', role: 'user' }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(refreshResponse)
      });

      const result = await authService.refreshToken();

      expect(result).toEqual(refreshResponse);
      expect(authService.getAccessToken()).toBe('refreshed.token');
    });

    it('should throw error when no initData available', async () => {
      await expect(authService.refreshToken()).rejects.toThrow('No initData available for token refresh');
    });
  });

  describe('getValidAccessToken', () => {
    it('should return existing valid token', async () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjIwMDAwMDAwMDB9.mLQjHEQ8VrKLapLp5W6qk8KQG2P0Y8Q2QpCz3G1jXGg';
      vi.spyOn(authService as any, 'getAccessToken').mockReturnValue(validToken);

      const token = await authService.getValidAccessToken();
      expect(token).toBe(validToken);
    });

    it('should refresh expired token', async () => {
      // Set up expired token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      vi.spyOn(authService as any, 'getAccessToken').mockReturnValue(expiredToken);

      // Mock successful refresh
      const refreshResponse = {
        accessToken: 'new.valid.token',
        user: { id: '123', role: 'user' }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(refreshResponse)
      });

      const token = await authService.getValidAccessToken();
      expect(token).toBe('new.valid.token');
    });
  });

  describe('logout', () => {
    it('should clear all auth state', async () => {
      // Set up initial state
      const mockResponse = {
        accessToken: 'mock.token',
        user: { id: '123', role: 'user' }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await authService.login('init_data');

      expect(authService.getAccessToken()).toBe('mock.token');

      authService.logout();

      expect(authService.getAccessToken()).toBeNull();
    });
  });
});