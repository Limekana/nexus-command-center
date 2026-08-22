import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ConfirmProvider } from './components/ConfirmDialog';
import { initWebAnalytics } from './lib/webAnalytics';
import './i18n';
import './index.css';

// No-op unless this bundle was built by Vercel — see webAnalytics.ts.
initWebAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </HashRouter>
  </React.StrictMode>
);
