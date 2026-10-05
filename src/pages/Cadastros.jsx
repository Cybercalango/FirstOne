import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Páginas de cadastro: Variantes, Tipos, Grades (com tamanhos), Pessoas e Modelos/Itens
const tabs = [
  { id: 'variants', label: '🎨 Variantes' },
  { id: 'types', label: '📿 Tipos' },
  { id: 'grids', label: '📏 Grades de Tamanho' },
  { id: 'people', label: '👤 Clientes / Vendedores' },
];

function SimpleList({ table, labelSingular }) {
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    const { data, error } = await supabase.from(table).select('*').order('id');
    if (!error) setRows(data || []);
    else setMsg('Erro ao carregar: ' + error.message);
  };
  useEffect(() => { load(); }, [table]);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const { error } = await supabase.from(table).insert([{ name: name.trim() }]);
    if (error) setMsg('Erro: ' + error.message);
    else { setName(''); setMsg(`${labelSingular} cadastrado(a)!`); load(); }
  };

  const remove = async (id) => {
    if (!window.confirm('Excluir este registro?')) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) setMsg('Erro: ' + error.message); else load();
  };

  return (
    <div className="cad-block">
      <form onSubmit={add} className="cad-form">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Nova ${labelSingular}`} />
        <button type="submit">Adicionar</button>
      </form>
      <ul className="cad-list">
        {rows.map((r) => (
          <li key={r.id}>
            <span>{r.name}</span>
            <button className="del-btn" onClick={() => remove(r.id)}>✕</button>
          </li>
        ))}
      </ul>
      {msg && <p className="cad-msg">{msg}</p>}
    </div>
  );
}

function Grids() {
  const [grids, setGrids] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [gridName, setGridName] = useState('');
  const [selGrid, setSelGrid] = useState(null);
  const [newSize, setNewSize] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    const { data } = await supabase.from('size_grids').select('*').order('id');
    setGrids(data || []);
    const { data: s } = await supabase.from('grid_sizes').select('*').order('id');
    setSizes(s || []);
  };
  useEffect(() => { load(); }, []);

  const addGrid = async (e) => {
    e.preventDefault();
    if (!gridName.trim()) return;
    const { error } = await supabase.from('size_grids').insert([{ name: gridName.trim() }]);
    if (error) setMsg('Erro: ' + error.message);
    else { setGridName(''); load(); }
  };

  const addSize = async (e) => {
    e.preventDefault();
    if (!selGrid || !newSize.trim()) return;
    const { error } = await supabase.from('grid_sizes').insert([{ grid_id: Number(selGrid), size: newSize.trim() }]);
    if (error) setMsg('Erro: ' + error.message);
    else { setNewSize(''); load(); }
  };

  const delSize = async (id) => {
    await supabase.from('grid_sizes').delete().eq('id', id);
    load();
  };

  const sizesOf = (gid) => sizes.filter((s) => s.grid_id === gid);

  return (
    <div className="cad-block">
      <form onSubmit={addGrid} className="cad-form">
        <input value={gridName} onChange={(e) => setGridName(e.target.value)} placeholder="Nova grade (ex.: Anéis Femininos)" />
        <button type="submit">Criar Grade</button>
      </form>

      {grids.map((g) => (
        <div key={g.id} className="grid-card">
          <h4>{g.name}</h4>
          <div className="chips">
            {sizesOf(g.id).map((s) => (
              <span key={s.id} className="chip">
                {s.size} <button onClick={() => delSize(s.id)}>✕</button>
              </span>
            ))}
          </div>
          <form className="cad-form inline" onSubmit={(e) => { e.preventDefault(); setSelGrid(String(g.id)); addSize(e); }}>
            <input value={selGrid === String(g.id) ? newSize : ''} onChange={(e) => { setSelGrid(String(g.id)); setNewSize(e.target.value); }} placeholder="Tamanho (ex.: 15)" />
            <button type="submit">+ Tamanho</button>
          </form>
        </div>
      ))}
      {msg && <p className="cad-msg">{msg}</p>}
    </div>
  );
}

function People() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ name: '', cpf_cnpj: '', phone: '', email: '', address: '', is_client: true, is_consignor: false });
  const [msg, setMsg] = useState('');

  const load = async () => {
    const { data } = await supabase.from('people').select('*').order('id', { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    const { error } = await supabase.from('people').insert([f]);
    if (error) setMsg('Erro: ' + error.message);
    else { setF({ name: '', cpf_cnpj: '', phone: '', email: '', address: '', is_client: true, is_consignor: false }); setMsg('Pessoa cadastrada!'); load(); }
  };

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div className="cad-block">
      <form onSubmit={submit} className="cad-form people-form">
        <input placeholder="Nome *" value={f.name} onChange={set('name')} />
        <input placeholder="CPF/CNPJ" value={f.cpf_cnpj} onChange={set('cpf_cnpj')} />
        <input placeholder="Telefone/WhatsApp" value={f.phone} onChange={set('phone')} />
        <input placeholder="E-mail" value={f.email} onChange={set('email')} />
        <input placeholder="Endereço" value={f.address} onChange={set('address')} />
        <label><input type="checkbox" checked={f.is_client} onChange={set('is_client')} /> Cliente</label>
        <label><input type="checkbox" checked={f.is_consignor} onChange={set('is_consignor')} /> Vendedor/Consignatário</label>
        <button type="submit">Cadastrar</button>
      </form>
      <table className="cad-table">
        <thead><tr><th>Nome</th><th>Contato</th><th>Papel</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.phone} {p.email && `· ${p.email}`}</td>
              <td>{[p.is_client && 'Cliente', p.is_consignor && 'Consignatário'].filter(Boolean).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <p className="cad-msg">{msg}</p>}
    </div>
  );
}

export default function Cadastros() {
  const [tab, setTab] = useState('variants');
  return (
    <div className="cad-container">
      <h2>Cadastros Base</h2>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'variants' && <SimpleList table="variants" labelSingular="variante" />}
      {tab === 'types' && <SimpleList table="types" labelSingular="tipo" />}
      {tab === 'grids' && <Grids />}
      {tab === 'people' && <People />}
    </div>
  );
}
