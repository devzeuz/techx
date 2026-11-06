import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="footer" aria-label="Site footer">
      <div className="container">
        <div className="footer-inner">
          {/* ── Brand ── */}
          <div className="footer-brand">
            <span className="footer-logo">tx</span>
            <p className="footer-tagline">
              Structured technical video curricula for software engineers.
              Track progress, take lesson notes, and study at your own pace.
            </p>
          </div>

          {/* ── Platform links ── */}
          <div className="footer-col">
            <h4 className="footer-col-title">Platform</h4>
            <Link to="/"          className="footer-link">Explore</Link>
            <Link to="/courses"   className="footer-link">Course Marketplace</Link>
            <Link to="/dashboard" className="footer-link">My Dashboard</Link>
            <Link to="/about"     className="footer-link">About</Link>
          </div>

          {/* ── Resources ── */}
          <div className="footer-col">
            <h4 className="footer-col-title">Company</h4>
            <span className="footer-link-plain">Privacy Policy</span>
            <span className="footer-link-plain">Terms of Service</span>
            <span className="footer-link-plain">Support</span>
          </div>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div className="footer-bottom">
        <div className="container">
          © {year} tx. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
