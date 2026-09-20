import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ConfirmProvider } from './components/ConfirmDialog';
import { initWebAnalytics } from './lib/webAnalytics';
import './i18n';
import './index.css';
// v1.15 (Item 13) — additive: every rule is scoped to [data-theme='rack'],
// so without the attribute the app renders the free theme unchanged.
import './themes/rack.css';
import { syncTheme } from './lib/theme';
import { ENTITLEMENT_EVENT } from './lib/entitlement';

syncTheme();
window.addEventListener(ENTITLEMENT_EVENT, () => syncTheme());

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
