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
import ErrorBoundary from './components/ErrorBoundary';
import { installGlobalErrorHandlers } from './lib/errorReports';
import { notePolicyBaseline } from './lib/policyNotice';

syncTheme();
window.addEventListener(ENTITLEMENT_EVENT, () => syncTheme());

// No-op unless this bundle was built by Vercel — see webAnalytics.ts.
initWebAnalytics();

// v1.16 (limecore#16) — errors outside render (handlers, timers, promises).
// Reports only while the Settings switch is on; see lib/errorReports.ts.
installGlobalErrorHandlers();
// Before onboarding can run: a fresh install starts on the current policy.
notePolicyBaseline();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Outermost, so a throw anywhere below — router and providers included —
        lands on the recovery screen instead of a blank page (limecore#16). */}
    <ErrorBoundary>
      <HashRouter>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
