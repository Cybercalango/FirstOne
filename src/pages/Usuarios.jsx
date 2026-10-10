import React, { useState, useEffect } from 'react';
import BackBar from '../components/BackBar';
import { supabase } from '../supabaseClient';

// Página exclusiva do ADMINISTRADOR: criar usuários (login/senha),
// definir nível de acesso e alterar a própria senha.
function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [role, setRole] = useState('vendedor');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Alterar a própria senha
  const [novaSenha, setNovaSenha] = useState('');
  const [msgSenha, setMsgSenha] = useState('');

  const userId = localStorage.getItem('userId');

  useEffect(() => {
    carregarUsuarios();
  }, []);

  async function carregarUsuarios() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, role, created_at')
      .order('created_at', { ascending: false });
    if (data) setUsuarios(data || []);
    if (error) console.error(error);
  }

  async function criarUsuario(e) {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    try {
      // 1. Cria o usuário de autenticação (login + senha)
      const { data, error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: { data: { nome } },
      });
      if (error) throw error;

      if (data.user) {
        // 2. Cria o perfil com o nível de acesso escolhido
        const { error: errPerfil } = await supabase.from('profiles').insert({
          id: data.user.id,
          email,
          role,
        });
        if (errPerfil) throw errPerfil;
        setMsg(`Usuário ${email} criado como ${role}.`);
        setNome(''); setEmail(''); setSenha(''); setRole('vendedor');
        carregarUsuarios();
      } else {
        setMsg('Usuário criado, mas confirme o e-mail antes de usar o login.');
      }
    } catch (err) {
      setMsg('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function alterarRole(id, novoRole) {
    const { error } = await supabase
      .from('profiles')
      .update({ role: novoRole })
      .eq('id', id);
    if (!error) carregarUsuarios();
  }

  async function removerUsuario(id) {
    if (!window.confirm('Remover este perfil? (O login permanece no sistema; use o painel do Supabase para excluí-lo por completo.)')) return;
    await supabase.from('profiles').delete().eq('id', id);
    carregarUsuarios();
  }

  async function trocarMinhaSenha(e) {
    e.preventDefault();
    setMsgSenha('');
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) setMsgSenha('Erro: ' + error.message);
    else {
      setMsgSenha('Senha alterada com sucesso.');
      setNovaSenha('');
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <BackBar title="Gerenciar Usuários" />
      <h2>Gerenciar Usuários (Administrador)</h2>

      <form onSubmit={criarUsuario} className="card" style={{ padding: 16, marginBottom: 24, border: '1px solid #ddd', borderRadius: 8 }}>
        <h3>Criar novo usuário</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          <input placeholder="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <input type="email" placeholder="E-mail (será o login)" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Senha inicial (mín. 6 caracteres)" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={6} required />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="administrador">Administrador</option>
            <option value="gerente">Gerente</option>
            <option value="vendedor">Vendedor</option>
          </select>
          <button type="submit" disabled={loading}>{loading ? 'Criando...' : 'Criar usuário'}</button>
        </div>
        {msg && <p>{msg}</p>}
      </form>

      <form onSubmit={trocarMinhaSenha} style={{ marginBottom: 24 }}>
        <h3>Alterar minha senha</h3>
        <input type="password" placeholder="Nova senha" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} minLength={6} required />{' '}
        <button type="submit">Alterar senha</button>
        {msgSenha && <p>{msgSenha}</p>}
      </form>

      <h3>Usuários cadastrados</h3>
      <table width="100%" cellPadding={8} style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
            <th>E-mail</th><th>Nível de acesso</th><th></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{u.email}</td>
              <td>
                <select value={u.role} onChange={(e) => alterarRole(u.id, e.target.value)} disabled={u.id === userId}>
                  <option value="administrador">Administrador</option>
                  <option value="gerente">Gerente</option>
                  <option value="vendedor">Vendedor</option>
                </select>
              </td>
              <td>
                {u.id !== userId && (
                  <button onClick={() => removerUsuario(u.id)}>Remover</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Usuarios;
