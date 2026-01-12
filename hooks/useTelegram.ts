import { useEffect, useState, useCallback } from 'react';
import { TelegramUser } from '../types';

const tg = (window as any).Telegram?.WebApp;

export function useTelegram() {
  const [user, setUser] = useState<TelegramUser | null>(null);

  useEffect(() => {
    if (tg) {
      tg.ready();
      try {
        tg.expand(); // Request full height
        
        // UX: Match header color to app brand, but allow background to adapt
        // We use the CSS variable mapped in index.html for background
        const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--tg-theme-bg-color').trim();
        tg.setHeaderColor('#3b82f6'); // Keep Header Blue (Brand)
        tg.setBackgroundColor(bgColor || '#f3f4f6');
        
        // Native BackButton management is handled in App.tsx via location
      } catch (e) {
        console.warn('Error setting TG appearance', e);
      }

      setUser(tg.initDataUnsafe?.user || null);
    }
  }, []);

  const showAlert = useCallback((message: string) => {
    if (tg) {
      tg.showAlert(message);
    } else {
      alert(message); // Fallback for web testing
    }
  }, []);

  const openLink = useCallback((url: string) => {
    if (tg) {
      tg.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  }, []);

  return {
    tg,
    user,
    showAlert,
    openLink,
    haptic: (style: 'light' | 'medium' | 'heavy' | 'selection' | 'error' | 'success') => {
      if (!tg) return;
      if (style === 'selection') tg.HapticFeedback.selectionChanged();
      else if (style === 'error' || style === 'success') tg.HapticFeedback.notificationOccurred(style);
      else tg.HapticFeedback.impactOccurred(style);
    }
  };
}