import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BackBar from '../components/BackBar';
import { supabase } from '../supabaseClient';

// Cadastro de Peças (Itens). Os cadastros base relativos aos produtos
// (variantes, tipos, grades e modelos) foram movidos para /cadastros.
export default function Produtos() {
  const navigate = useNavigate();
  const [models, setModels] = useState([]);
  const [types, setTypes] = useState([]);
  const [variants, setVariants] = useState([]);
  const [grids, setGrids] = useState([]);
  const [gridSizes, setGridSizes] = useState([]);
  const [people, setPeople] = useState([]);
  const [items, setItems] = useState([]);
  const [selModel, setSelModel] = useState(null);
  const [msg, setMsg] = useState('');

  // form item
  const [it, setIt] = useState({ barcode: '', variant_id: '', size: '', price_cost: '', price_sale: '', status: 'estoque', owner_type: 'loja', owner_id: '', acquisition_date: '' });

  const load = async () => {
    const [mo, ty, va, gr, gs, pe, im] = await Promise.all([
      supabase.from('models').select('*').order('id', { ascending: false }),
      supabase.from('types').select('*').order('name'),
      supabase.from('variants').select('*').order('name'),
      supabase.from('size_grids').select('*').order('name'),
      supabase.from('grid_sizes').select('*').order('id'),
      supabase.from('people').select('*').order('name'),
      supabase.from('items').select('*').order('id', { ascending: false }),
    ]);
    setModels(mo.data || []); setTypes(ty.data || []); setVariants(va.data || []);
    setGrids(gr.data || []); setGridSizes(gs.data || []); setPeople(pe.data || []); setItems(im.data || []);
  };
  useEffect(() => { load(); }, []);

  const addItem = async (e) => {
    e.preventDefault();
    if (!selModel) { setMsg('Selecione um modelo primeiro.'); return; }
    const { error } = await supabase.from('items').insert([{
      model_id: selModel,
      barcode: it.barcode.trim() || null,
      variant_id: it.variant_id ? Number(it.variant_id) : null,
      size: it.size || null,
      price_cost: it.price_cost ? Number(it.price_cost) : 0,
      price_sale: it.price_sale ? Number(it.price_sale) : 0,
      status: it.status,
      owner_type: it.owner_type,
      owner_id: it.owner_type === 'pessoa' && it.owner_id ? Number(it.owner_id) : null,
      acquisition_date: it.acquisition_date || null,
    }]);
    if (error) setMsg('Erro: ' + error.message);
    else { setIt({ ...it, barcode: '', size: '', price_cost: '', price_sale: '', acquisition_date: '' }); setMsg('Item cadastrado!'); load(); }
  };

  const modelName = (id) => (models.find((x) => x.id === id) || {}).name || '—';
  const typeName = (id) => (types.find((x) => x.id === id) || {}).name || '—';
  const variantName = (id) => (variants.find((x) => x.id === id) || {}).name || '—';
  const personName = (id) => (people.find((x) => x.id === id) || {}).name || '—';
  const sizesForModel = () => {
    const mdl = models.find((x) => x.id === selModel);
    if (!mdl || !mdl.default_grid_id) return [];
    return gridSizes.filter((s) => s.grid_id === mdl.default_grid_id).map((s) => s.size);
  };

  return (
    <div className="cad-container">
      <BackBar title="Produtos — Peças" />
      <h2>Produtos — Cadastro de Peças</h2>

      <div className="cad-block">
        <h3>Cadastrar Peça (Item)</h3>
        <p style={{ fontSize: 14, color: '#555' }}>
          💡 Os cadastros base de produtos (variantes, tipos, grades e modelos) ficam em{' '}
          <a href="/cadastros" onClick={(e) => { e.preventDefault(); navigate('/cadastros'); }}>Cadastros Base — Produtos</a>.
        </p>
        <form onSubmit={addItem} className="cad-form people-form">
          <select value={selModel || ''} onChange={(e) => setSelModel(Number(e.target.value))}>
            <option value="">Selecionar modelo…</option>
            {models.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <input placeholder="Código de barras" value={it.barcode} onChange={(e) => setIt({ ...it, barcode: e.target.value })} />
          <select value={it.variant_id} onChange={(e) => setIt({ ...it, variant_id: e.target.value })}>
            <option value="">Variação…</option>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select value={it.size} onChange={(e) => setIt({ ...it, size: e.target.value })}>
            <option value="">Tamanho…</option>
            {sizesForModel().map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="number" step="0.01" placeholder="Preço custo" value={it.price_cost} onChange={(e) => setIt({ ...it, price_cost: e.target.value })} />
          <input type="number" step="0.01" placeholder="Preço venda" value={it.price_sale} onChange={(e) => setIt({ ...it, price_sale: e.target.value })} />
          <select value={it.status} onChange={(e) => setIt({ ...it, status: e.target.value })}>
            <option value="estoque">Estoque próprio</option>
            <option value="consignacao">Consignação</option>
          </select>
          <select value={it.owner_type} onChange={(e) => setIt({ ...it, owner_type: e.target.value })}>
            <option value="loja">Dono: Loja</option>
            <option value="pessoa">Dono: Vendedor/Parceiro</option>
          </select>
          {it.owner_type === 'pessoa' && (
            <select value={it.owner_id} onChange={(e) => setIt({ ...it, owner_id: e.target.value })}>
              <option value="">Selecionar parceiro…</option>
              {people.filter((p) => p.is_consignor).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <label>Aquisição: <input type="date" value={it.acquisition_date} onChange={(e) => setIt({ ...it, acquisition_date: e.target.value })} /></label>
          <button type="submit">Adicionar Peça</button>
        </form>
        {msg && <p className="cad-msg">{msg}</p>}
      </div>

      <div className="cad-block">
        <h3>Peças Cadastradas</h3>
        <table className="cad-table">
          <thead><tr><th>Código</th><th>Modelo</th><th>Variação</th><th>Tam.</th><th>Venda</th><th>Status</th><th>Proprietário</th><th>Aquisição</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.barcode || i.id}</td>
                <td>{modelName(i.model_id)}</td>
                <td>{variantName(i.variant_id)}</td>
                <td>{i.size || '—'}</td>
                <td>{i.price_sale ? `R$ ${Number(i.price_sale).toFixed(2)}` : '—'}</td>
                <td>{i.status}</td>
                <td>{i.owner_type === 'pessoa' ? personName(i.owner_id) : 'Loja'}</td>
                <td>{i.acquisition_date || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
