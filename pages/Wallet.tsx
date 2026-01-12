
import React, { useEffect } from 'react';
import Header from '../components/Header';
import { TonConnectButton } from '@tonconnect/ui-react';
import { useAppContext } from '../context/AppContext';
import { Ticket, Music, Coins, RefreshCw, ExternalLink } from 'lucide-react';
import { useTelegram } from '../hooks/useTelegram';
import { analytics } from '../services/analyticsService';

const Wallet: React.FC = () => {
  const { walletAddress, zbtToken, tonBalance, isBalanceLoading, refreshBalance, telegramUser } = useAppContext();
  const { openLink } = useTelegram();

  useEffect(() => {
    if (walletAddress) {
        analytics.track('wallet_connected', { address_masked: walletAddress.slice(0, 5) + '...' });
    }
  }, [walletAddress]);

  const handleRedeemClick = (item: string) => {
      analytics.track('redeem_click', { item, balance: zbtToken.balance });
  };

  return (
    <div className="pt-16 pb-20 min-h-screen bg-background flex flex-col items-center">
      <Header title="My Wallet" />

      <div className="w-full max-w-sm px-6 mt-6 space-y-4">
        
        {/* Connection Status */}
        <div className="flex justify-center mb-2" onClick={() => analytics.track('wallet_connect_click')}>
            <TonConnectButton />
        </div>

        {/* Welcome Message */}
        <div className="text-center mb-4">
           <p className="text-hint text-sm">
             Welcome, <span className="font-bold text-text">{telegramUser?.first_name || 'Guest'}</span>
           </p>
        </div>

        {/* Balance Card */}
        <div className="bg-surface rounded-2xl shadow-sm p-6 relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
                <h3 className="text-sm font-bold text-text">Token Balance (Testnet)</h3>
                <button 
                    onClick={refreshBalance} 
                    className={`text-hint hover:text-primary transition-all ${isBalanceLoading ? 'animate-spin' : ''}`}
                >
                    <RefreshCw size={16} />
                </button>
            </div>
            
            <div className="flex items-baseline space-x-2">
                <span className="text-4xl font-bold text-text">{zbtToken.balance}</span>
                <span className="text-lg font-bold text-primary">{zbtToken.symbol}</span>
            </div>
            
            <div className="mt-1 flex items-center space-x-2 text-sm text-hint font-medium">
                <span>{tonBalance} TON</span>
                <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                <span className="text-green-600">Active</span>
            </div>

            {walletAddress && (
                <div className="mt-4 pt-4 border-t border-gray-100 text-[10px] text-hint font-mono break-all flex items-center gap-1">
                    <div className="truncate flex-1">{walletAddress}</div>
                    <button 
                      onClick={() => {
                        analytics.track('explorer_link_click');
                        openLink(`https://testnet.tonscan.org/address/${walletAddress}`);
                      }}
                      className="text-blue-500 hover:text-blue-600"
                    >
                      <ExternalLink size={12} />
                    </button>
                </div>
            )}
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-2 gap-3">
             <div className="bg-surface p-4 rounded-xl shadow-sm flex flex-col items-center justify-center text-center">
                 <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-2">
                     <Coins size={20} />
                 </div>
                 <span className="font-bold text-xs text-text">Quiz Rewards</span>
                 <span className="text-[10px] text-hint mt-1">Earn via Gameplay</span>
             </div>
             
             <button 
                onClick={() => {
                    analytics.track('faucet_link_click');
                    openLink("https://t.me/testnet_faucet_bot");
                }}
                className="bg-surface p-4 rounded-xl shadow-sm flex flex-col items-center justify-center text-center hover:bg-background transition-colors"
             >
                 <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-2">
                     <ExternalLink size={20} />
                 </div>
                 <span className="font-bold text-xs text-text">TON Faucet</span>
                 <span className="text-[10px] text-hint mt-1">Get Testnet TON</span>
             </button>
        </div>

        {/* Redeem Options */}
        <div className="bg-surface rounded-2xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-text mb-4">Redeem Options</h3>
            <div className="flex justify-between gap-2">
                <div 
                    onClick={() => handleRedeemClick('tickets')}
                    className="flex flex-col items-center text-center w-1/3 opacity-50 cursor-pointer hover:opacity-100 transition-opacity"
                >
                    <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-hint mb-2">
                        <Ticket size={20} />
                    </div>
                    <span className="text-[10px] font-bold text-hint leading-tight">Concert<br/>Tickets</span>
                </div>
                
                <div 
                    onClick={() => handleRedeemClick('premium')}
                    className="flex flex-col items-center text-center w-1/3 opacity-50 cursor-pointer hover:opacity-100 transition-opacity"
                >
                    <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-hint mb-2">
                        <Music size={20} />
                    </div>
                    <span className="text-[10px] font-bold text-hint leading-tight">Premium<br/>Access</span>
                </div>
            </div>
            <p className="text-center text-[10px] text-hint mt-4">Redemption requires positive {zbtToken.symbol} balance.</p>
        </div>

      </div>
    </div>
  );
};

export default Wallet;
