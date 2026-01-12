import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, ListMusic, Wallet, User } from 'lucide-react';
import { useTelegram } from '../hooks/useTelegram';

const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { haptic } = useTelegram();

  const handleNav = (path: string) => {
    if (location.pathname !== path) {
      haptic('selection');
      navigate(path);
    }
  };

  const getTabStyle = (path: string) => {
    const isActive = location.pathname === path;
    return `flex flex-col items-center justify-center w-full h-full space-y-1 ${
      isActive ? 'text-primary' : 'text-gray-400'
    }`;
  };

  return (
    // Added pb-safe-bottom and height calculation
    <nav className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex justify-around items-start z-50 pt-2 pb-safe-bottom h-[calc(4rem+env(safe-area-inset-bottom))]">
      <button onClick={() => handleNav('/')} className={getTabStyle('/')}>
        <Home size={24} />
        <span className="text-[10px] font-medium">Home</span>
      </button>
      <button onClick={() => handleNav('/quiz')} className={getTabStyle('/quiz')}>
        <ListMusic size={24} />
        <span className="text-[10px] font-medium">Quiz</span>
      </button>
      <button onClick={() => handleNav('/wallet')} className={getTabStyle('/wallet')}>
        <Wallet size={24} />
        <span className="text-[10px] font-medium">Wallet</span>
      </button>
      <button onClick={() => handleNav('/profile')} className={getTabStyle('/profile')}>
        <User size={24} />
        <span className="text-[10px] font-medium">Profile</span>
      </button>
    </nav>
  );
};

export default BottomNav;