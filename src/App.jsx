import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Dashboard from './Dashboard';
import Cadastros from './pages/Cadastros';
import Produtos from './pages/Produtos';
import Usuarios from './pages/Usuarios';
import Consignacoes from './pages/Consignacoes';
import Movimentacoes from './pages/Movimentacoes';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/cadastros" element={<Cadastros />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/consignacoes" element={<Consignacoes />} />
        <Route path="/movimentacoes" element={<Movimentacoes />} />
        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
