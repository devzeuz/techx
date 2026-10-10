import React, { useEffect, useState } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { fetchAuthSession, getCurrentUser, signOut as amplifySignOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { Authenticator } from '@aws-amplify/ui-react';

/* ── Error boundary — prevents blank screen on component crashes ── */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unknown error' };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', background: 'var(--color-bg)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '16px', color: 'var(--color-text-primary)',
          fontFamily: 'Inter, sans-serif', padding: '32px',
        }}>
          <h2 style={{ margin: 0 }}>Something went wrong</h2>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            {this.state.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px', borderRadius: '8px',
              background: 'var(--color-accent)', color: '#fff',
              border: 'none', cursor: 'pointer', fontWeight: 600,
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Theme
import { ThemeProvider } from './ThemeContext';

// Shared components
import Navbar      from './components/Navbar';
import Footer      from './components/Footer';
import CustomAuth  from './components/CustomAuth';
import Spinner     from './components/Spinner';

// Pages
import LandingPage  from './LandingPage';
import Dashboard    from './Dashboard';
import Bookmarks    from './Bookmarks';
import CoursePlayer from './CoursePlayer';
import Admin        from './Admin';
import About        from './About';

/* ── Access-denied page for non-admin /admin attempts ── */
const AccessDenied = () => (
  <div style={{
    minHeight: '80vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '16px',
    textAlign: 'center', padding: '32px',
  }}>
    <div style={{
      width: '72px', height: '72px', borderRadius: '16px',
      background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <h1 style={{ fontSize: '1.6rem', fontWeight: '800', margin: 0 }}>Access Denied</h1>
    <p style={{ color: 'var(--color-text-secondary)', margin: 0, maxWidth: '340px', lineHeight: '1.6' }}>
      You don't have permission to access the Admin panel.
      Please contact your supervisor to request access.
    </p>
    <a href="/" className="btn btn-ghost" style={{ marginTop: '8px' }}>← Back to Explore</a>
  </div>
);

/* ── Authenticated shell ─────────────────────────────── */
const AuthenticatedApp = ({ user, signOut }) => {
  const [isAdmin,        setIsAdmin]        = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const session = await fetchAuthSession({ forceRefresh: true });
        // Optional chaining — tokens can be null if the session is briefly invalid
        const groups = session.tokens?.accessToken?.payload?.['cognito:groups'] ?? [];
        setIsAdmin(groups.includes('Admin'));
      } catch {
        setIsAdmin(false);
      } finally {
        setIsAdminLoading(false);
      }
    })();
  }, [user]);

  // Admin route element: spinner while checking, then Admin or AccessDenied
  const adminElement = isAdminLoading
    ? <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner size="lg" /></div>
    : isAdmin
      ? <Admin />
      : <AccessDenied />;

  return (
    <Router>
      <Navbar user={user} signOut={signOut} />
      <Routes>
        <Route path="/"                element={<LandingPage  user={user} />} />
        <Route path="/dashboard"       element={<Dashboard    user={user} />} />
        <Route path="/bookmarks"       element={<Bookmarks    user={user} />} />
        <Route path="/about"           element={<About />} />
        <Route path="/learn/:courseId" element={<CoursePlayer user={user} />} />
        <Route path="/admin"           element={adminElement} />
      </Routes>
      <Footer />
    </Router>
  );
};

/* ── Standalone loader (must be outside AppContent to avoid re-creation) ── */
const PageLoader = () => (
  <div style={{
    minHeight: '100vh', background: 'var(--color-bg)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <Spinner size="lg" />
  </div>
);

/* ── Inner app ────────────────────────────────────────── */
const AppContent = () => {
  const [appUser,  setAppUser]  = useState(null);
  const [checking, setChecking] = useState(true);

  const loadUser = React.useCallback(async () => {
    try {
      const u = await getCurrentUser();
      setAppUser(u);
    } catch {
      setAppUser(null);
    }
  }, []);

  useEffect(() => {
    // Check for an existing session on mount then clear the loading flag
    (async () => {
      await loadUser();
      setChecking(false);
    })();

    // Re-sync whenever Amplify fires auth events
    const unsub = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn')  loadUser();
      if (payload.event === 'signedOut') setAppUser(null);
    });
    return unsub;
  }, [loadUser]);

  const handleSignOut = async () => {
    try { await amplifySignOut(); } catch { /* ignore */ }
    setAppUser(null);
  };

  if (checking) return <PageLoader />;

  return appUser
    ? <AuthenticatedApp user={appUser} signOut={handleSignOut} />
    : <CustomAuth onSuccess={loadUser} />;
};


/* ── Root app ────────────────────────────────────────── */
function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <Authenticator.Provider>
          <AppContent />
        </Authenticator.Provider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;