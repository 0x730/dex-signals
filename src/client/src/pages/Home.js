import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

const Home = () => {
  return (
    <div className="container-fluid home-container">
      <div className="row">
        <div className="col-md-12 text-center">
          <h1 className="home-title">Token Monitor</h1>
          <p className="home-subtitle">
            Track and analyze tokens across multiple blockchains
          </p>
        </div>
      </div>

      <div className="row mt-5">
        <div className="col-md-6">
          <div className="card feature-card">
            <div className="card-body">
              <h3 className="card-title">
                <i className="fas fa-coins me-2"></i>
                Token Analysis
              </h3>
              <p className="card-text">
                View detailed information about tokens, including scores,
                historical data, and risk assessments.
              </p>
              <Link to="/tokens" className="btn btn-primary">
                View Tokens
              </Link>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card feature-card">
            <div className="card-body">
              <h3 className="card-title">
                <i className="fas fa-chart-line me-2"></i>
                Paper Trading
              </h3>
              <p className="card-text">
                Test trading strategies with paper trading signals without
                risking real funds.
              </p>
              <Link to="/signals/paper" className="btn btn-primary">
                View Paper Trading
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="row mt-4">
        <div className="col-md-12">
          <div className="card info-card">
            <div className="card-body">
              <h3 className="card-title">
                <i className="fas fa-info-circle me-2"></i>
                About Token Monitor
              </h3>
              <p className="card-text">
                Token Monitor is a powerful tool for tracking and analyzing
                tokens across multiple blockchains. Our platform provides
                real-time data, scoring, and risk assessment to help you make
                informed decisions.
              </p>
              <p className="card-text">
                We support multiple chains including Base, Arbitrum, and
                Ethereum, with more coming soon.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
