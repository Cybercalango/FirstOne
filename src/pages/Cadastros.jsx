import React, { useState, useEffect } from 'react';
import BackBar from '../components/BackBar';
import { supabase } from '../supabaseClient';
import { setEmpresaCache } from '../utils/empresa';

// Cadastros base relativos aos produtos: Variantes, Tipos, Grades (com tamanhos) e Modelos.
// Obs.: o cadastro de Pessoas foi promovido a card próprio no menu principal (/pessoas).
const tabs = [
  { id: 'variants', label: '🎨 Variantes' },
  { id: 'types', label: '📿 Tipos' },
  { id: 'grids', label: '📏 Grades de Tamanho' },
  { id: 'models', label: '💍 Modelos de Joia' },
  { id: 'empresa', label: '🏪 Empresa' },
];

// ---------- Empresa (dados usados nas impressões — romaneio timbrado) ----------
// Tabela company_settings (linha única id=1, sql/29). Upload do logo no bucket
// público 'catalogo' (mesma policy por usuário dos produtos); se não houver
// upload novo, o app usa /logo-flor-da-pele.png embutido no build.
function Empresa() {
  const CAMPOS = [
    ['nome', 'Nome fantasia *'], ['slogan', 'Slogan'],
    ['telefone', 'Telefone'], ['whatsapp', 'WhatsApp'],
    ['email', 'E-mail'], ['site', 'Site'], ['instagram', '@Instagram'],
    ['endereco', 'Endereço (rua, nº)'], ['cidade_uf', 'Cidade/UF'], ['cep', 'CEP'],
    ['cnpj', 'CNPJ'],
  ];
  const vazio = { nome: '', slogan: '', telefone: '', whatsapp: '', email: '', site: '', instagram: '', endereco: '', cidade_uf: '', cep: '', cnpj: '', logo_url: '' };
  const [f, setF] = useState(vazio);
  const [temLinha, setTemLinha] = useState(false);
  const [msg, setMsg] = useState('');
  const [enviandoLogo, setEnviandoLogo] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from('company_settings').select('*').eq('id', 1).maybeSingle();
    if (error) { setMsg('Erro ao carregar: ' + error.message + ' — execute sql/29_config_empresa.sql no Supabase.'); return; }
    if (data) { setTemLinha(true); setF({ ...vazio, ...data }); }
  };
  useEffect(() => { load(); }, []);

  const salvar = async (e) => {
    e.preventDefault();
    if (!f.nome.trim()) { setMsg('Informe o nome da empresa.'); return; }
    const payload = { id: 1, atualizado_em: new Date().toISOString(), ...Object.fromEntries(Object.entries(f).map(([k, val]) => [k, String(val ?? '').trim() || null])) };
    payload.nome = f.nome.trim();
    let res;
    if (temLinha) res = await supabase.from('company_settings').update(payload).eq('id', 1);
    else res = await supabase.from('company_settings').upsert(payload);
    if (res.error) { setMsg('Erro ao salvar: ' + res.error.message); return; }
    setTemLinha(true);
    setEmpresaCache(payload); // vale para romaneios sem precisar recarregar
    setMsg('✅ Dados da empresa salvos. As próximas impressões já usam este cabeçalho/rodapé.');
  };

  const enviarLogo = async (file) => {
    if (!file) return;
    setEnviandoLogo(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) throw new Error('Sessão não encontrada — faça login novamente.');
      const path = `${uid}/empresa-logo-${Date.now()}.png`;
      const { error: errUp } = await supabase.storage.from('catalogo').upload(path, file, { contentType: file.type || 'image/png', upsert: true });
      if (errUp) throw errUp;
      const { data: pub } = await supabase.storage.from('catalogo').getPublicUrl(path);
      setF((p) => ({ ...p, logo_url: pub.publicUrl }));
      setMsg('Logo anexado — clique em Salvar para aplicar.');
    } catch (e) {
      setMsg('Não foi possível enviar o logo (' + (e?.message || 'sem conexão com o storage') + '). Sem upload, a impressão usa o logo padrão do sistema.');
    } finally { setEnviandoLogo(false); }
  };

  return (
    <div className="cad-block">
      <h3>Dados da empresa (usados nas impressões)</h3>
      <form onSubmit={salvar} className="cad-form people-form">
        {CAMPOS.map(([k, ph]) => (
          <label key={k}>{ph}
            <input value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </label>
        ))}
        <label>Logo (PNG/JPG, opcional)
          <input type="file" accept="image/*" disabled={enviandoLogo}
            onChange={(e) => enviarLogo(e.target.files?.[0])} />
        </label>
        {f.logo_url && <img src={f.logo_url} alt="logo atual" style={{ maxHeight: 64, maxWidth: 200 }} />}
        <button type="submit">{enviandoLogo ? 'Enviando…' : 'Salvar dados da empresa'}</button>
      </form>
      {msg && <p className="cad-msg">{msg}</p>}
    </div>
  );
}

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
              <td data-label="Modelo">{m.name}</td>
              <td data-label="Tipo">{typeName(m.type_id)}</td>
              <td data-label="Grade">{gridName(m.default_grid_id)}</td>
              <td data-label="Ações"><button className="del-btn" onClick={() => remove(m.id)}>✕</button></td>
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
      {tab === 'empresa' && <Empresa />}
    </div>
  );
}
