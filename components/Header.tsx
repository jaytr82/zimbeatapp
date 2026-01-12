import React from 'react';
import { MoreHorizontal } from 'lucide-react';
// Back button logic is now handled globally in App.tsx via Telegram Native Button

interface HeaderProps {
  title: string;
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  return (
    <header className="fixed top-0 left-0 right-0 bg-primary text-white flex items-center justify-between px-4 z-50 shadow-md pt-safe-top pb-2 h-[calc(3.5rem+env(safe-area-inset-top))]">
      <div className="flex items-center">
        {/* Native Back Button is used instead of DOM elements */}
        <h1 className="text-lg font-semibold tracking-wide ml-1">{title}</h1>
      </div>
      <button>
        <MoreHorizontal size={24} />
      </button>
    </header>
  );
};

export default Header;