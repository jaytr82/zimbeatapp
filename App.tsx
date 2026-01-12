import React, { useEffect, Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import { AppProvider } from './context/AppContext';
import { useTelegram } from './hooks/useTelegram';
import { analytics } from './services/analyticsService';
import { Loader2 } from 'lucide-react';

// Lazy load pages for code splitting
const Home = lazy(() => import('./pages/Home'));
const Quiz = lazy(() => import('./pages/Quiz').then(module => {
  // Preload related services when Quiz is requested
  import('./services/dataService');
  import('./services/rewardService');
  return module;
}));
const Wallet = lazy(() => import('./pages/Wallet'));
const ArtistDashboard = lazy(() => import('./pages/ArtistDashboard'));

// Loading component for Suspense fallback
const PageLoader = () => (
  <div className="min-h-screen bg-gray-100 flex items-center justify-center">
    <div className="text-center">
      <Loader2 className="animate-spin text-primary mx-auto mb-4" size={48} />
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
);

// Component to handle global routing logic (Back Button) & Analytics
const AppNavigator: React.FC = () => {
  const { tg } = useTelegram();
  const location = useLocation();
  const navigate = useNavigate();

  // Track Page Views
  useEffect(() => {
    analytics.track('page_view', {
      path: location.pathname,
      search: location.search
    });
  }, [location]);

  useEffect(() => {
    if (!tg) return;

    // Define root tabs where Back Button should be HIDDEN
    const isRoot = ['/', '/quiz', '/wallet', '/profile'].includes(location.pathname);

    if (isRoot) {
      tg.BackButton.hide();
    } else {
      tg.BackButton.show();
    }

    // Attach click listener
    const handleBack = () => {
      navigate(-1);
    };
    tg.BackButton.onClick(handleBack);

    return () => {
      tg.BackButton.offClick(handleBack);
    };
  }, [location, tg, navigate]);

  return (
    <div className="min-h-screen bg-background text-text font-sans antialiased">
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/profile" element={<ArtistDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <BottomNav />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <Router>
        <AppNavigator />
      </Router>
    </AppProvider>
  );
};

export default App;