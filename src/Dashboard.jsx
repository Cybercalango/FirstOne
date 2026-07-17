import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

function Dashboard() {
  const [userRole, setUserRole] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const role = localStorage.getItem('userRole');
    if (!role) {
      navigate('/login');
      return;
    }
    setUserRole(role);
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    navigate('/login');
  };

  if (!userRole) return <div>Carregando...</div>;

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Painel de Controle - Joias Manager</h1>
        <div className="user-info">
          <span>Perfil: {userRole.toUpperCase()}</span>
          <button onClick={handleLogout} className="logout-btn">Sair</button>
        </div>
      </header>

      <main className="dashboard-content">
        <div className="menu-grid">
          {(userRole === 'administrador' || userRole === 'gerente') && (
            <>
              <div className="menu-item">
                <h3>📦 Estoque</h3>
                <p>Gerenciar produtos em estoque</p>
              </div>
              <div className="menu-item">
                <h3>🤝 Consignação</h3>
                <p>Produtos em consignação</p>
              </div>
            </>
          )}

          {userRole === 'administrador' && (
            <div className="menu-item">
              <h3>⚙️ Administração</h3>
              <p>Configurações e usuários</p>
            </div>
          )}

          <div className="menu-item">
            <h3>💰 Vendas</h3>
            <p>Registrar vendas e PDV</p>
          </div>

          <div className="menu-item">
            <h3>📊 Relatórios</h3>
            <p>Visualizar relatórios</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
