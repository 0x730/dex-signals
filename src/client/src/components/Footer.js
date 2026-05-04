import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-gradient"></div>
      <div className="container-fluid">
        <div className="footer-content">
          <div className="footer-brand">
            <i className="fas fa-chart-line"></i>
            <span>Token Monitor</span>
          </div>
          <div className="footer-links">
            <Link to="/">Home</Link>
            <Link to="/tokens">Tokens</Link>
            <Link to="/signals/paper">Paper Trading</Link>
            <a
              href="https://dexscreener.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              DexScreener
            </a>
          </div>
          <div className="footer-copyright">
            &copy; {currentYear} All rights reserved
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
