import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Header.css';

const Header = () => {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  // Add scroll event listener to change header style on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Check if a nav link is active
  const isActive = (path) => {
    return (
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  };

  return (
    <nav
      className={`navbar navbar-expand-lg navbar-dark ${scrolled ? 'scrolled' : ''}`}
    >
      <div className="header-gradient"></div>
      <div className="container-fluid">
        <Link className="navbar-brand" to="/">
          <div className="brand-logo">
            <i className="fas fa-chart-line"></i>
          </div>
          <span className="brand-text">Token Monitor</span>
        </Link>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav">
            <li className="nav-item">
              <Link
                className={`nav-link ${isActive('/tokens') ? 'active' : ''}`}
                to="/tokens"
              >
                <i className="fas fa-coins nav-icon"></i>
                Tokens
              </Link>
            </li>
            <li className="nav-item">
              <Link
                className={`nav-link ${isActive('/signals/paper') ? 'active' : ''}`}
                to="/signals/paper"
              >
                <i className="fas fa-chart-bar nav-icon"></i>
                Paper Trading
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default Header;
