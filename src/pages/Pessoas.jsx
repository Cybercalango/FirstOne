import React, { useState, useEffect } from 'react';
import BackBar from '../components/BackBar';
import { supabase } from '../supabaseClient';

// Cadastro de pessoas (clientes, vendedores e consignatários) — card de 1º nível no menu.
export default function Pessoas() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ name: '', cpf_cnpj: '', phone: '', email: '', address: '', is_client: true, is_consignor: false });
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const { data, error } = await supabase.from('people').select('*').order('id', { ascending: false });
    if (!error) setRows(data || []);
    else setMsg('Erro ao carregar: ' + error.message);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    const { error } = editing
      ? await supabase.from('people').update(f).eq('id', editing)
      : await supabase.from('people').insert([f]);
    if (error) setMsg('Erro: ' + error.message);
    else {
      setF({ name: '', cpf_cnpj: '', phone: '', email: '', address: '', is_client: true, is_consignor: false });
      setMsg(editing ? 'Pessoa atualizada!' : 'Pessoa cadastrada!');
      setEditing(null);
      load();
    }
  };

  const edit = (p) => {
    setEditing(p.id);
    setF({
      name: p.name || '', cpf_cnpj: p.cpf_cnpj || '', phone: p.phone || '',
      email: p.email || '', address: p.address || '',
      is_client: !!p.is_client, is_consignor: !!p.is_consignor,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (id) => {
    if (!window.confirm('Excluir esta pessoa?')) return;
    const { error } = await supabase.from('people').delete().eq('id', id);
    if (error) setMsg('Erro: ' + error.message); else load();
  };

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div className="cad-container">
      <BackBar title="Cadastro de Pessoas" />
      <h2>👥 Clientes e Vendedores</h2>

      <div className="cad-block">
        <h3>{editing ? 'Editar Pessoa' : 'Nova Pessoa'}</h3>
        <form onSubmit={submit} className="cad-form people-form">
          <input placeholder="Nome *" value={f.name} onChange={set('name')} />
          <input placeholder="CPF/CNPJ" value={f.cpf_cnpj} onChange={set('cpf_cnpj')} />
          <input placeholder="Telefone/WhatsApp" value={f.phone} onChange={set('phone')} />
          <input placeholder="E-mail" value={f.email} onChange={set('email')} />
          <input placeholder="Endereço" value={f.address} onChange={set('address')} />
          <label><input type="checkbox" checked={f.is_client} onChange={set('is_client')} /> Cliente</label>
          <label><input type="checkbox" checked={f.is_consignor} onChange={set('is_consignor')} /> Vendedor/Consignatário</label>
          <button type="submit">{editing ? 'Salvar Alterações' : 'Cadastrar'}</button>
          {editing && (
            <button type="button" onClick={() => { setEditing(null); setF({ name: '', cpf_cnpj: '', phone: '', email: '', address: '', is_client: true, is_consignor: false }); }}>
              Cancelar edição
            </button>
          )}
        </form>
        {msg && <p className="cad-msg">{msg}</p>}
      </div>

      <div className="cad-block">
        <h3>Pessoas Cadastradas</h3>
        <table className="cad-table">
          <thead><tr><th>Nome</th><th>Contato</th><th>Papel</th><th>Ações</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}{p.cpf_cnpj ? ` · ${p.cpf_cnpj}` : ''}</td>
                <td>{p.phone} {p.email && `· ${p.email}`}</td>
                <td>{[p.is_client && 'Cliente', p.is_consignor && 'Vendedor/Consignatário'].filter(Boolean).join(', ')}</td>
                <td>
                  <button className="edit-btn" onClick={() => edit(p)} style={{ marginRight: 6 }}>✏️</button>
                  <button className="del-btn" onClick={() => remove(p.id)}>✕</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="4">Nenhuma pessoa cadastrada ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
