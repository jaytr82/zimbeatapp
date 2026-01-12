
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { Song, TelegramUser, UserRole, AssetBalance, AppContextType } from '../types';
import { getTelegramUser, getTelegramInitData } from '../services/identityService';
import { authService } from '../services/authService';
import { fetchJettonBalance, fetchTonBalance } from '../services/tonService';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Identity State
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [role, setRole] = useState<UserRole>('user');
  const [viewMode, setViewMode] = useState<UserRole>('user');
  const [isIdentityLoading, setIsIdentityLoading] = useState(true);
  
  // Connect to TON Wallet Hook
  const walletAddress = useTonAddress(); 

  // Functional State
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Asset State
  const [zbtToken, setZbtToken] = useState<AssetBalance>({ symbol: 'ZBT', balance: '0.00', decimals: 9, rawBalance: '0' });
  const [tonBalance, setTonBalance] = useState<string>('0.00');
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);

  // 1. Initialize Telegram User & Perform Auth Handshake
  useEffect(() => {
    const initApp = async () => {
        setIsIdentityLoading(true);
        const user = getTelegramUser();
        const initData = getTelegramInitData();

        setTelegramUser(user);

        if (initData) {
            try {
                // Exchange Telegram credentials for Backend JWT
                const authResponse = await authService.login(initData);
                
                // Set Role based on verified backend data
                const backendRole = authResponse.user.role;
                setRole(backendRole);
                
                // Set initial View Mode
                if (backendRole === 'artist') {
                    setViewMode('artist');
                } else {
                    setViewMode('user');
                }
            } catch (e) {
                console.error("Auth handshake failed:", e);
                // Fallback to basic 'user' role if backend is unreachable, 
                // but strictly speaking app should probably block or retry.
                setRole('user');
            }
        }

        setIsIdentityLoading(false);
    };

    initApp();
  }, []);

  // 1.5 Background Token Refresh (proactive refresh before expiry)
  useEffect(() => {
    if (!telegramUser) return;

    const checkAndRefreshToken = async () => {
      if (authService.isTokenExpired()) {
        try {
          console.log('Proactively refreshing token...');
          await authService.refreshToken();
          console.log('Token refreshed successfully');
        } catch (error) {
          console.error('Background token refresh failed:', error);
        }
      }
    };

    // Check every 30 minutes
    const interval = setInterval(checkAndRefreshToken, 30 * 60 * 1000);

    // Also check on app focus/visibility change
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkAndRefreshToken();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [telegramUser]);

  // 2. Fetch Real Balances (Wallet)
  useEffect(() => {
    if (walletAddress) {
        refreshBalance();
    } else {
        // Reset if wallet disconnected
        setZbtToken({ symbol: 'ZBT', balance: '0.00', decimals: 9, rawBalance: '0' });
        setTonBalance('0.00');
    }
  }, [walletAddress]);

  const refreshBalance = async () => {
    if (!walletAddress) return;
    setIsBalanceLoading(true);
    
    const [jetton, ton] = await Promise.all([
        fetchJettonBalance(walletAddress),
        fetchTonBalance(walletAddress)
    ]);
    
    setZbtToken(jetton);
    setTonBalance(ton);
    setIsBalanceLoading(false);
  };

  return (
    <AppContext.Provider value={{ 
      telegramUser,
      walletAddress: walletAddress || null,
      role,
      viewMode,
      setViewMode,
      isIdentityLoading,
      currentSong, 
      setCurrentSong, 
      isPlaying, 
      setIsPlaying,
      zbtToken,
      tonBalance,
      isBalanceLoading,
      refreshBalance
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
