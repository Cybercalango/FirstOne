import React, { useState, useEffect } from 'react';
import { supabase, SUPABASE_URL } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import './Login.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  // Se já existe usuário no Supabase, esconde o botão de criar conta
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) navigate('/dashboard');
      } catch (e) {
        console.error(e);
      }
    })();
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('invalid login credentials')) {
          throw new Error(
            'E-mail ou senha incorretos. Se você não possui cadastro, peça ao administrador para criar seu acesso.'
          );
        }
        if (msg.includes('email not confirmed')) {
          throw new Error(
            'Este e-mail ainda não foi confirmado. No painel do Supabase: Authentication → Sign In / Up → desative "Confirm email" e tente novamente.'
          );
        }
        throw error;
      }

      // Verificar perfil do usuário
      let role = null;
      const nomeUser = data.user?.user_metadata?.nome || '';
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile) {
        role = profile.role;
      } else {
        // O perfil não apareceu: pode (a) realmente não existir, ou
        // (b) existir mas estar invisível/bloqueado pelas políticas RLS.
        // Estratégia: tentar criar/promover o perfil automaticamente.
        // - Se a pessoa é o ÚNICO usuário do sistema, ela se torna o
        //   primeiro administrador (bootstrap de segurança).
        // - Se já existem outros usuários, o insert é bloqueado pela RLS
        //   (somente administradores podem gravar em profiles), então a
        //   tentativa falha com segurança e pedimos ajuda de um admin.
        let soleUserCheckFailed = true; // assume "pode ser o único" se a checagem falhar
        try {
          const resp = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=2`,
            { headers: { Authorization: `Bearer ${data.session.access_token}` } }
          );
          if (resp.ok) {
            const j = await resp.json();
            const total = Array.isArray(j.auditors) ? j.auditors.length : (j.users || []).length;
            soleUserCheckFailed = false;
            if (total <= 1) {
              // Primeiro acesso: cria/promove o perfil como administrador
              const { data: upserted, error: upsertError } = await supabase
                .from('profiles')
                .upsert({ id: data.user.id, email, nome: nomeUser, role: 'administrador' }, { onConflict: 'id' })
                .select('role')
                .maybeSingle();
              role = upserted?.role || 'administrador';
              if (upsertError) console.warn('Aviso ao gravar perfil (RLS?):', upsertError.message);
            }
          }
        } catch (e) {
          console.warn('Não foi possível listar usuários:', e);
        }

        // Se a checagem de "único usuário" falhou (rede/permite), tenta o bootstrap mesmo assim.
        if (!role && soleUserCheckFailed) {
          const { data: upserted, error: upsertError } = await supabase
            .from('profiles')
            .upsert({ id: data.user.id, email, nome: nomeUser, role: 'administrador' }, { onConflict: 'id' })
            .select('role')
            .maybeSingle();
          if (upserted) {
            role = upserted.role;
          } else if (upsertError) {
            console.warn('Bootstrap de perfil bloqueado:', upsertError.message);
          }
        }

        if (!role) {
          console.error('Perfil ausente:', profileError);
          setMessage(
            'Você entrou, mas não possui um perfil de acesso (tabela profiles). ' +
            'Peça a um administrador para criar/recuperar seu perfil na tela Administração, ' +
            'ou verifique as políticas RLS da tabela profiles no Supabase.'
          );
          await supabase.auth.signOut();
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

        <h2>Entrar</h2>
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
