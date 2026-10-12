import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Dashboard from './Dashboard';
import Cadastros from './pages/Cadastros';
import Produtos from './pages/Produtos';
import Pessoas from './pages/Pessoas';
import Usuarios from './pages/Usuarios';
import Consignacoes from './pages/Consignacoes';
import Movimentacoes from './pages/Movimentacoes';
import Vendas from './pages/Vendas';
import Relatorios from './pages/Relatorios';
import Etiquetas from './pages/Etiquetas';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/cadastros" element={<Cadastros />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/pessoas" element={<Pessoas />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/consignacoes" element={<Consignacoes />} />
        <Route path="/movimentacoes" element={<Movimentacoes />} />
        <Route path="/vendas" element={<Vendas />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/etiquetas" element={<Etiquetas />} />
        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
