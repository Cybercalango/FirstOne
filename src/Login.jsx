import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import './Login.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Verificar perfil do usuário
      let role = null;
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (profile) {
        role = profile.role;
      } else {
        // Perfil não existe ainda (ex.: criado antes da tabela ou sem confirmação de e-mail):
        // cria automaticamente com papel padrão para destravar o primeiro acesso.
        const { data: created, error: createError } = await supabase
          .from('profiles')
          .insert({ id: data.user.id, email, role: 'administrador' })
          .select('role')
          .single();

        if (created && !createError) {
          role = created.role;
        } else {
          console.error('Erro ao verificar/criar perfil:', profileError, createError);
          setMessage(
            'Login OK, mas não foi possível acessar o banco de dados (perfil). ' +
            'Verifique as tabelas/políticas no Supabase.'
          );
          setLoading(false);
          return;
        }
      }

      localStorage.setItem('userRole', role);
      localStorage.setItem('userId', data.user.id);
      navigate('/dashboard');
    } catch (error) {
      // Mostra a mensagem real do erro (ajuda a diagnosticar problemas de rede/banco)
      console.error('Falha no login:', error);
      const msg = error?.message || '';
      if (/Failed to fetch|NetworkError|fetching/i.test(msg)) {
        setMessage('Sem conexão com o servidor do banco de dados. Verifique sua internet e tente novamente.');
      } else {
        setMessage(msg || 'Erro ao fazer login');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>Joias Manager</h1>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        {message && <p className="message">{message}</p>}
      </div>
    </div>
  );
}

export default Login;
