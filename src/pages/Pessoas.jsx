import React, { useState, useEffect } from 'react';
import BackBar from '../components/BackBar';
import PersonForm from '../components/PersonForm';
import { supabase } from '../supabaseClient';

// Cadastro de pessoas (clientes, vendedores e consignatários) — card de 1º nível no menu.
export default function Pessoas() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [initial, setInitial] = useState(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const { data, error } = await supabase.from('people').select('*').order('id', { ascending: false });
    if (!error) setRows(data || []);
    else setMsg('Erro ao carregar: ' + error.message);
  };
  useEffect(() => { load(); }, []);

  const handleSubmit = async (formValues) => {
    const payload = {
      name: formValues.name, cpf_cnpj: formValues.cpf_cnpj, birth_date: formValues.birth_date || null,
      phone: formValues.phone, email: formValues.email, address: formValues.address,
      zip: formValues.zip, street: formValues.street, number: formValues.number,
      district: formValues.district, city: formValues.city, state: formValues.state,
      complement: formValues.complement,
      is_client: formValues.is_client, is_consignor: formValues.is_consignor,
    };
    const { error } = editing
      ? await supabase.from('people').update(payload).eq('id', editing)
      : await supabase.from('people').insert([payload]);
    if (error) { setMsg('Erro: ' + error.message + ' — se as colunas de endereço não existirem, rode o script SQL 11.'); return; }
    setMsg(editing ? 'Pessoa atualizada!' : 'Pessoa cadastrada!');
    setEditing(null); setInitial(null);
    load();
  };

  const edit = (p) => {
    setEditing(p.id);
    setInitial({
      name: p.name || '', cpf_cnpj: p.cpf_cnpj || '', birth_date: p.birth_date || '',
      phone: p.phone || '', email: p.email || '',
      zip: p.zip || '', street: p.street || '', number: p.number || '',
      district: p.district || '', city: p.city || '', state: p.state || '', complement: p.complement || '',
      is_client: !!p.is_client, is_consignor: !!p.is_consignor,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => { setEditing(null); setInitial(null); };

  const remove = async (id) => {
    if (!window.confirm('Excluir esta pessoa?')) return;
    const { error } = await supabase.from('people').delete().eq('id', id);
    if (error) setMsg('Erro: ' + error.message); else load();
  };

  return (
    <div className="cad-container">
      <BackBar title="Cadastro de Pessoas" />
      <h2>👥 Clientes e Vendedores</h2>

      <div className="cad-block">
        <h3>{editing ? 'Editar Pessoa' : 'Nova Pessoa'}</h3>
        <PersonForm key={editing ?? 'new'} initial={initial} onSubmit={handleSubmit}
          submitLabel={editing ? 'Salvar Alterações' : 'Cadastrar'}
          onCancel={editing ? cancelEdit : undefined} />
        {msg && <p className="cad-msg">{msg}</p>}
      </div>

      <div className="cad-block">
        <h3>Pessoas Cadastradas</h3>
        <table className="cad-table">
          <thead><tr><th>Nome</th><th>Contato</th><th>Endereço</th><th>Papel</th><th>Ações</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}{p.cpf_cnpj ? ` · ${p.cpf_cnpj}` : ''}</td>
                <td>{p.phone} {p.email && `· ${p.email}`}</td>
                <td>{p.address || '—'}</td>
                <td>{[p.is_client && 'Cliente', p.is_consignor && 'Vendedor/Consignatário'].filter(Boolean).join(', ')}</td>
                <td>
                  <button className="edit-btn" onClick={() => edit(p)} style={{ marginRight: 6 }}>✏️</button>
                  <button className="del-btn" onClick={() => remove(p.id)}>✕</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="5">Nenhuma pessoa cadastrada ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
