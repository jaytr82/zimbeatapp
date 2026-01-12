import { TelegramUser } from '../types';

/**
 * Extracts user data from the Telegram WebApp SDK for initial UI rendering.
 * Note: Authentic data comes from the Backend via authService.
 */
export const getTelegramUser = (): TelegramUser | null => {
  const tg = (window as any).Telegram?.WebApp;
  if (!tg) {
    return null;
  }
  return tg.initDataUnsafe?.user || null;
};

/**
 * Helper to get the raw initData string for authentication
 */
export const getTelegramInitData = (): string | null => {
  const tg = (window as any).Telegram?.WebApp;
  return tg?.initData || null;
};