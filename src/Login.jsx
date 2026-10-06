import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import './Login.css';

function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [nome, setNome] = useState('');
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

  const handleSignup = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setMessage('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nome } },
      });
      if (error) throw error;

      if (!data.session) {
        setMessage(
          'Conta criada, mas o Supabase está exigindo confirmação por e-mail. ' +
          'No painel do Supabase: Authentication → Sign In / Up → desative "Confirm email" e tente entrar.'
        );
        setLoading(false);
        return;
      }

      // Cria o perfil de administrador automaticamente
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: data.user.id, email, nome, role: 'administrador' });

      if (profileError) {
        console.error('Erro ao criar perfil:', profileError);
        setMessage('Login criado, mas houve problema ao gravar o perfil no banco. Verifique as políticas RLS da tabela profiles.');
        setLoading(false);
        return;
      }

      localStorage.setItem('userRole', 'administrador');
      localStorage.setItem('userId', data.user.id);
      navigate('/dashboard');
    } catch (error) {
      console.error('Falha no cadastro:', error);
      const msg = error?.message || '';
      if (/already registered|already exists/i.test(msg)) {
        setMessage('Este e-mail já está cadastrado. Faça login abaixo.');
        setMode('login');
      } else if (/Failed to fetch|NetworkError/i.test(msg)) {
        setMessage('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
      } else {
        setMessage(msg || 'Erro ao criar conta');
      }
    } finally {
      setLoading(false);
    }
  };

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
            'E-mail ou senha incorretos. Se você ainda NÃO possui cadastro, use o botão "Criar conta de administrador" abaixo.'
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

        {mode === 'login' ? (
          <>
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
            <p className="toggle-link">
              Ainda não possui cadastro?{' '}
              <button type="button" className="link-btn" onClick={() => { setMode('signup'); setMessage(''); }}>
                Criar conta de administrador
              </button>
            </p>
          </>
        ) : (
          <>
            <h2>Criar conta de administrador</h2>
            <form onSubmit={handleSignup}>
              <input
                type="text"
                placeholder="Seu nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
              />
              <input
                type="email"
                placeholder="E-mail (será o seu login)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Senha (mínimo 6 caracteres)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button type="submit" disabled={loading}>
                {loading ? 'Criando...' : 'Criar conta e entrar'}
              </button>
            </form>
            <p className="toggle-link">
              Já possui conta?{' '}
              <button type="button" className="link-btn" onClick={() => { setMode('login'); setMessage(''); }}>
                Fazer login
              </button>
            </p>
          </>
        )}

        {message && <p className="message">{message}</p>}
      </div>
    </div>
  );
}

export default Login;
