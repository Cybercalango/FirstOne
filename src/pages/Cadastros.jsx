import React, { useState, useEffect } from 'react';
import BackBar from '../components/BackBar';
import { supabase } from '../supabaseClient';

// Cadastros base relativos aos produtos: Variantes, Tipos, Grades (com tamanhos) e Modelos.
// Obs.: o cadastro de Pessoas foi promovido a card próprio no menu principal (/pessoas).
const tabs = [
  { id: 'variants', label: '🎨 Variantes' },
  { id: 'types', label: '📿 Tipos' },
  { id: 'grids', label: '📏 Grades de Tamanho' },
  { id: 'models', label: '💍 Modelos de Joia' },
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

function Models() {
  const [models, setModels] = useState([]);
  const [types, setTypes] = useState([]);
  const [grids, setGrids] = useState([]);
  const [f, setF] = useState({ name: '', type_id: '', default_grid_id: '', description: '' });
  const [msg, setMsg] = useState('');

  const load = async () => {
    const [mo, ty, gr] = await Promise.all([
      supabase.from('models').select('*').order('id', { ascending: false }),
      supabase.from('types').select('*').order('name'),
      supabase.from('size_grids').select('*').order('name'),
    ]);
    setModels(mo.data || []); setTypes(ty.data || []); setGrids(gr.data || []);
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    const { error } = await supabase.from('models').insert([{
      name: f.name.trim(),
      type_id: f.type_id ? Number(f.type_id) : null,
      default_grid_id: f.default_grid_id ? Number(f.default_grid_id) : null,
      description: f.description || null,
    }]);
    if (error) setMsg('Erro: ' + error.message);
    else { setF({ name: '', type_id: '', default_grid_id: '', description: '' }); setMsg('Modelo criado!'); load(); }
  };

  const remove = async (id) => {
    if (!window.confirm('Excluir este modelo? As peças vinculadas perderão a referência.')) return;
    const { error } = await supabase.from('models').delete().eq('id', id);
    if (error) setMsg('Erro: ' + error.message); else load();
  };

  const typeName = (id) => (types.find((t) => t.id === id) || {}).name || '—';
  const gridName = (id) => (grids.find((g) => g.id === id) || {}).name || '—';

  return (
    <div className="cad-block">
      <h3>Novo Modelo de Joia</h3>
      <form onSubmit={add} className="cad-form people-form">
        <input placeholder="Nome do modelo * (ex.: Anel Solitário)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select value={f.type_id} onChange={(e) => setF({ ...f, type_id: e.target.value })}>
          <option value="">Tipo…</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={f.default_grid_id} onChange={(e) => setF({ ...f, default_grid_id: e.target.value })}>
          <option value="">Grade de tamanho…</option>
          {grids.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input placeholder="Descrição" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <button type="submit">Criar Modelo</button>
      </form>

      <table className="cad-table">
        <thead><tr><th>Modelo</th><th>Tipo</th><th>Grade</th><th>Ações</th></tr></thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>{typeName(m.type_id)}</td>
              <td>{gridName(m.default_grid_id)}</td>
              <td><button className="del-btn" onClick={() => remove(m.id)}>✕</button></td>
            </tr>
          ))}
          {models.length === 0 && <tr><td colSpan="4">Nenhum modelo cadastrado ainda.</td></tr>}
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
      <BackBar title="Cadastros Base" />
      <h2>Cadastros Base — Produtos</h2>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'variants' && <SimpleList table="variants" labelSingular="variante" />}
      {tab === 'types' && <SimpleList table="types" labelSingular="tipo" />}
      {tab === 'grids' && <Grids />}
      {tab === 'models' && <Models />}
    </div>
  );
}
