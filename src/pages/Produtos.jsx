import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BackBar from '../components/BackBar';
import LeitorCodigo from '../components/LeitorCodigo';
import { supabase } from '../supabaseClient';
import { gerarCodigoInterno } from '../utils/codigoInterno';

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

  // ---- Pesquisa de peças ----
  const [pesquisaAberta, setPesquisaAberta] = useState(false);
  const [qTexto, setQTexto] = useState('');       // código ou parte dele
  const [qModelo, setQModelo] = useState('');     // id do modelo
  const [qVariacao, setQVariacao] = useState(''); // id da variação
  const [qStatus, setQStatus] = useState('');     // estoque | consignacao | vendido | emprestimo...
  const [resultados, setResultados] = useState(null); // null = ainda não pesquisou
  const [pesquisando, setPesquisando] = useState(false);

  const pesquisar = async (codigoForcado) => {
    const texto = (codigoForcado !== undefined ? codigoForcado : qTexto).trim();
    setPesquisando(true);
    let query = supabase.from('items').select('*').order('id', { ascending: false }).limit(200);
    if (texto) {
      // busca por código interno (exato ou parcial), aceita também com pontos/dashes
      const limpo = texto.replace(/[\s.-]/g, '');
      query = query.or(`barcode.eq.${texto},barcode.like.${limpo}*,barcode.like.${limpo}*`);
    }
    if (qModelo) query = query.eq('model_id', Number(qModelo));
    if (qVariacao) query = query.eq('variant_id', Number(qVariacao));
    if (qStatus) query = query.eq('status', qStatus);
    const { data, error } = await query;
    setPesquisando(false);
    if (error) { setMsg('Erro na pesquisa: ' + error.message); setResultados([]); }
    else { setResultados(data || []); setMsg(''); }
  };

  const limparPesquisa = () => {
    setQTexto(''); setQModelo(''); setQVariacao(''); setQStatus('');
    setResultados(null);
  };

  // Ao encontrar uma peça única via leitor, pré-preenche o formulário de cadastro
  const editarNaLista = (item) => {
    setSelModel(item.model_id || null);
    setIt((prev) => ({
      ...prev,
      barcode: item.barcode || '',
      variant_id: item.variant_id ? String(item.variant_id) : '',
      size: item.size || '',
      price_sale: item.price_sale != null ? String(item.price_sale) : prev.price_sale,
      price_cost: item.price_cost != null ? String(item.price_cost) : prev.price_cost,
      status: item.status || prev.status,
      owner_type: item.owner_type || 'loja',
      owner_id: item.owner_id ? String(item.owner_id) : '',
      acquisition_date: item.acquisition_date || '',
    }));
    setMsg(`Peça ${item.barcode || '#' + item.id} carregada no formulário.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
          <input placeholder="Código interno (8 dígitos)" value={it.barcode} onChange={(e) => setIt({ ...it, barcode: e.target.value })} />
          <button type="button" className="btn-sec" onClick={() => {
            // Gera código interno: modelo (seq do cadastro) + variação (2 díg.) + grade (1 díg.) + DV
            const mdlIdx = models.findIndex((x) => x.id === selModel);
            const vIdx = variants.findIndex((v) => String(v.id) === String(it.variant_id));
            const sizes = sizesForModel();
            const gIdx = sizes.indexOf(it.size);
            if (mdlIdx < 0 || vIdx < 0 || gIdx < 0) {
              setMsg('Selecione modelo, variação e tamanho antes de gerar o código.');
              return;
            }
            try {
              const code = gerarCodigoInterno({
                modelo: String(mdlIdx + 1).padStart(4, '0'),
                variacao: String(vIdx + 1).padStart(2, '0'),
                grade: String((gIdx % 9) + 1),
              });
              setIt({ ...it, barcode: code });
              setMsg(`Código interno gerado: ${code}`);
            } catch (err) { setMsg('Erro ao gerar código: ' + err.message); }
          }}>🔢 Gerar código interno</button>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Peças Cadastradas</h3>
          <button type="button" className="btn-sec" onClick={() => setPesquisaAberta((v) => !v)}>
            {pesquisaAberta ? '✖ Fechar Pesquisa' : '🔍 Pesquisar Produtos'}
          </button>
        </div>

        {pesquisaAberta && (
          <div className="cad-form people-form" style={{ marginTop: 12, padding: 12, background: '#f7f5fa', borderRadius: 10 }}>
            <input
              placeholder="Código interno (8 dígitos ou parte dele)"
              value={qTexto}
              onChange={(e) => setQTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') pesquisar(); }}
            />
            <select value={qModelo} onChange={(e) => setQModelo(e.target.value)}>
              <option value="">Todos os modelos</option>
              {models.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <select value={qVariacao} onChange={(e) => setQVariacao(e.target.value)}>
              <option value="">Todas as variações</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <select value={qStatus} onChange={(e) => setQStatus(e.target.value)}>
              <option value="">Todos os status</option>
              <option value="estoque">Em estoque</option>
              <option value="consignacao">Em consignação</option>
              <option value="emprestimo">Emprestado</option>
              <option value="vendido">Vendido</option>
            </select>
            <LeitorCodigo onCodigo={(c) => pesquisar(c)} placeholder="Ou leia a etiqueta 📷" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => pesquisar()} disabled={pesquisando}>
                {pesquisando ? 'Pesquisando…' : '🔍 Pesquisar'}
              </button>
              <button type="button" className="btn-sec" onClick={limparPesquisa}>Limpar filtros</button>
            </div>

            {resultados !== null && (
              <p style={{ fontSize: 14, color: '#555', margin: '6px 0' }}>
                {resultados.length === 0
                  ? 'Nenhuma peça encontrada com estes critérios.'
                  : `${resultados.length} peça(s) encontrada(s):`}
              </p>
            )}
            {resultados !== null && resultados.length > 0 && (
              <table className="cad-table">
                <thead><tr><th>Código</th><th>Modelo</th><th>Variação</th><th>Tam.</th><th>Venda</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {resultados.map((i) => (
                    <tr key={i.id}>
                      <td data-label="Código">{i.barcode || '#' + i.id}</td>
                      <td data-label="Modelo">{modelName(i.model_id)}</td>
                      <td data-label="Variação">{variantName(i.variant_id)}</td>
                      <td data-label="Tam.">{i.size || '—'}</td>
                      <td data-label="Venda">{i.price_sale ? `R$ ${Number(i.price_sale).toFixed(2)}` : '—'}</td>
                      <td data-label="Status">{i.status}</td>
                      <td data-label="Ações">
                        <button type="button" className="btn-sec" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => editarNaLista(i)}>Usar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <table className="cad-table">
          <thead><tr><th>Código</th><th>Modelo</th><th>Variação</th><th>Tam.</th><th>Venda</th><th>Status</th><th>Proprietário</th><th>Aquisição</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td data-label="Código">{i.barcode || i.id}</td>
                <td data-label="Modelo">{modelName(i.model_id)}</td>
                <td data-label="Variação">{variantName(i.variant_id)}</td>
                <td data-label="Tam.">{i.size || '—'}</td>
                <td data-label="Venda">{i.price_sale ? `R$ ${Number(i.price_sale).toFixed(2)}` : '—'}</td>
                <td data-label="Status">{i.status}</td>
                <td data-label="Proprietário">{i.owner_type === 'pessoa' ? personName(i.owner_id) : 'Loja'}</td>
                <td data-label="Aquisição">{i.acquisition_date || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
