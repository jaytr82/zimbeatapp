
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { Song, TelegramUser, UserRole, AssetBalance, AppContextType } from '../types';
import { getTelegramUser, getTelegramInitData } from '../services/identityService';
import { authService } from '../services/authService';
import { fetchJettonBalance, fetchTonBalance } from '../services/tonService';
import { Loader2, AlertCircle, Settings } from 'lucide-react';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Identity State
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [role, setRole] = useState<UserRole>('user');
  const [viewMode, setViewMode] = useState<UserRole>('user');
  
  // Auth State
  const [isIdentityLoading, setIsIdentityLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  
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
        setAuthError(null);

        try {
            // A. Get Environment Data
            const user = getTelegramUser();
            const initData = getTelegramInitData();

            setTelegramUser(user);

            // B. GATEWAY CHECK: Must be in Telegram
            if (!initData) {
                // For development outside Telegram, we can skip strict check if DEV is true
                // But generally, we want to warn.
                console.warn("Missing initData. App running outside Telegram?");
                
                // Allow simple UI testing without auth if configured (optional)
                // setAuthError("Please open this app inside Telegram.");
                // return;
            }

            // C. HANDSHAKE: Exchange Telegram credentials for Backend JWT
            // If running in browser without Telegram, this will naturally fail, which is expected.
            if (initData) {
                const authResponse = await authService.login(initData);
                
                // D. SUCCESS: Set Role based on verified backend data
                const backendRole = authResponse.user.role;
                setRole(backendRole);
                
                // Set initial View Mode
                if (backendRole === 'artist') {
                    setViewMode('artist');
                } else {
                    setViewMode('user');
                }
            } else {
                // If checking layout in browser, mock a user
                console.info("Running in browser mode (No Telegram Data)");
            }

        } catch (e: any) {
            console.error("Auth Critical Failure:", e);
            setAuthError(e.message || "Authentication failed. Please reload.");
        } finally {
            setIsIdentityLoading(false);
        }
    };

    initApp();
  }, []);

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

  // 3. RENDER GATES
  if (isIdentityLoading) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-500">
            <Loader2 className="animate-spin mb-4 text-blue-500" size={40} />
            <p className="text-sm font-medium">Authenticating...</p>
        </div>
    );
  }

  if (authError) {
    const isConfigError = authError.includes("Missing API Key") || authError.includes("Deployment Error");

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isConfigError ? 'bg-orange-100 text-orange-500' : 'bg-red-100 text-red-500'}`}>
                {isConfigError ? <Settings size={32} /> : <AlertCircle size={32} />}
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
                {isConfigError ? 'Configuration Error' : 'Access Denied'}
            </h2>
            <p className="text-sm text-gray-600 mb-6 max-w-xs mx-auto break-words">
                {authError}
            </p>
            <button 
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-blue-500 text-white rounded-xl font-bold text-sm hover:bg-blue-600"
            >
                Reload App
            </button>
        </div>
    );
  }

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
