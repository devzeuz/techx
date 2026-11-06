import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sun, Moon, Menu, X, Shield } from 'lucide-react';
import { useTheme } from '../useTheme';

const NAV_LINKS = [
  { to: '/',          label: 'Explore'     },
  { to: '/courses',   label: 'Marketplace' },
  { to: '/dashboard', label: 'Dashboard'   },
  { to: '/about',     label: 'About'       },
];

const Navbar = ({ user, signOut }) => {
  const { theme, toggleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();

  const isActive = (path) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="container navbar-inner">

        {/* ── Logo ── */}
        <Link to="/" className="navbar-logo" onClick={closeDrawer}>
          tx
        </Link>

        {/* ── Desktop nav links ── */}
        <div className="navbar-links">
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`navbar-link ${isActive(to) ? 'nav-active' : ''}`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* ── Desktop right cluster ── */}
        <div className="navbar-actions">
          <Link to="/admin" className="badge badge-gold">
            <Shield size={11} />
            Admin
          </Link>

          <button
            id="theme-toggle"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <div className="navbar-sep" />

          <div className="navbar-avatar" title={user?.username} aria-label="User avatar">
            {user?.username?.charAt(0)?.toUpperCase() ?? '?'}
          </div>

          <button className="navbar-signout" onClick={signOut}>
            Sign out
          </button>
        </div>

        {/* ── Mobile burger ── */}
        <button
          className="navbar-burger"
          onClick={() => setDrawerOpen(prev => !prev)}
          aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={drawerOpen}
        >
          {drawerOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* ── Mobile drawer ── */}
      {drawerOpen && (
        <div className="navbar-drawer" id="mobile-nav-drawer">
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`navbar-drawer-link ${isActive(to) ? 'nav-active' : ''}`}
              onClick={closeDrawer}
            >
              {label}
            </Link>
          ))}
          <Link
              to="/admin"
              className="navbar-drawer-link text-gold"
              onClick={closeDrawer}
              style={{ borderBottom: 'none' }}
            >
              Admin Panel
            </Link>

          <div className="drawer-bottom-row">
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              {user?.username}
            </span>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button className="theme-toggle-btn" onClick={toggleTheme} aria-label="Toggle theme">
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button className="navbar-signout" onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
