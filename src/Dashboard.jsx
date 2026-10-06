import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

function Dashboard() {
  const [userRole, setUserRole] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      // Recarrega o papel direto do banco para corrigir valores antigos/ausentes
      // (ex.: usuário que entrou antes da tela de Administração existir).
      const userId = localStorage.getItem('userId');
      let role = localStorage.getItem('userRole');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session && !localStorage.getItem('skipAuthCheck')) {
          navigate('/login');
          return;
        }
        if (userId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle();
          if (profile?.role && profile.role !== role) {
            role = profile.role;
            localStorage.setItem('userRole', role);
          }
        }
      } catch (e) {
        console.warn('Não foi possível atualizar o papel:', e);
      }
      if (!role) {
        navigate('/login');
        return;
      }
      setUserRole(role);
    })();
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
              <div className="menu-item clickable" onClick={() => navigate('/produtos')}>
                <h3>📦 Produtos / Estoque</h3>
                <p>Cadastrar modelos, peças, variantes e consignação</p>
              </div>
              <div className="menu-item clickable" onClick={() => navigate('/cadastros')}>
                <h3>🗂️ Cadastros Base</h3>
                <p>Variantes, tipos, grades de tamanho, clientes e vendedores</p>
              </div>
            </>
          )}

          {userRole === 'administrador' && (
            <div className="menu-item clickable" onClick={() => navigate('/usuarios')}>
              <h3>⚙️ Administração</h3>
              <p>Criar logins, alterar senhas e níveis de acesso</p>
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
