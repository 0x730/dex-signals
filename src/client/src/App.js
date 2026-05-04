import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import './styles/Gradients.css';
import './styles/WideScreen.css';

// Import components
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import Tokens from './pages/Tokens';
import TokenDetail from './pages/TokenDetail';
import PaperTrading from './pages/PaperTrading';

function App() {
  return (
    <Router>
      <div className="App">
        <Header />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tokens" element={<Tokens />} />
            <Route path="/tokens/:id" element={<TokenDetail />} />
            <Route
              path="/signals/paper-trading-view"
              element={<PaperTrading />}
            />
            <Route path="/signals/paper" element={<PaperTrading />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
