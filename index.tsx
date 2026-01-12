import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { CONFIG } from './services/config';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <ErrorBoundary>
    <TonConnectUIProvider manifestUrl={CONFIG.MANIFEST_URL}>
      <App />
    </TonConnectUIProvider>
  </ErrorBoundary>
);