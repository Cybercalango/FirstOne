import React, { useState, useEffect } from 'react';
import BackBar from '../components/BackBar';
import LeitorCodigo from '../components/LeitorCodigo';
import { supabase } from '../supabaseClient';

// Consignação: remessa formal de peças a um parceiro, com prazo, devolução e acerto (cobrança).
// Layout inspirado na "Pesquisa de consignações" do sistema anterior:
// filtros (controle, período, cliente, faixa de valores) + grade + ações (Acerto/Romaneio/Pendências).
export default function Consignacoes() {
  const [consignments, setConsignments] = useState([]);
  const [cItems, setCItems] = useState([]);
  const [people, setPeople] = useState([]);
  const [items, setItems] = useState([]);
  const [models, setModels] = useState([]);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');

  // Filtros de pesquisa
  const [fControle, setFControle] = useState('');
  const [fIni, setFIni] = useState('');
  const [fFim, setFFim] = useState('');
  const [fCliente, setFCliente] = useState('');
  const [fValDe, setFValDe] = useState('');
  const [fValAte, setFValAte] = useState('');
  const [fStatus, setFStatus] = useState('todas');

  // Nova consignação (formulário expansível — botão Inserir)
  const [showNova, setShowNova] = useState(false);
  const [nc, setNc] = useState({ consignor_id: '', due_date: '', notes: '' });

  // Consignação selecionada na grade (Enter - Selecionar)
  const [selC, setSelC] = useState(null);
  const [addItemId, setAddItemId] = useState('');

  const load = async () => {
    const [co, ci, pe, im, mo] = await Promise.all([
      supabase.from('consignments').select('*').order('id', { ascending: false }),
      supabase.from('consignment_items').select('*'),
      supabase.from('people').select('*').order('name'),
      supabase.from('items').select('*').order('id', { ascending: false }),
      supabase.from('models').select('id,name').order('name'),
    ]);
    if (co.error) { setErro('Erro ao carregar consignações: ' + co.error.message); return; }
    if (ci.error) { setErro('Erro ao carregar itens da consignação. Verifique se o script SQL das consignações foi executado no Supabase.'); return; }
    setConsignments(co.data || []); setCItems(ci.data || []);
    setPeople(pe.data || []); setItems(im.data || []);
    setModels(mo.data || []);
  };
  useEffect(() => { load(); }, []);

  // ---------- cálculos auxiliares ----------
  const itemById = (id) => items.find((i) => i.id === id);
  const personName = (id) => (people.find((p) => p.id === id) || {}).name || '—';
  // Nome do modelo da peça (coluna "Modelo" do romaneio): models.name > items.name > descrição legada
  const modelName = (it) => {
    if (!it) return '—';
    const m = it.model_id && models.find((x) => x.id === it.model_id);
    return (m && m.name) || it.name || it.description || '—';
  };
  const ehCodigoLegado = (bc) => !!bc && !/^\d{8}(-\d{2})?$/.test(String(bc));
  const itemLabel = (id) => { const it = itemById(id); return it ? `${it.barcode || 'ID ' + it.id}${ehCodigoLegado(it.barcode) ? '*' : ''}` : `#${id}`; };
  const cPend = (cid) => cItems.filter((x) => x.consignment_id === cid && !x.returned && !x.sold);
  const cTotal = (cid) => cItems.filter((x) => x.consignment_id === cid).length;
  const cValor = (cid) => cPend(cid).reduce((s, x) => s + Number((itemById(x.item_id) || {}).price_sale || 0), 0);

  // ---------- pesquisa (grade filtrada) ----------
  const filtradas = consignments.filter((c) => {
    if (fControle && String(c.id) !== fControle.trim()) return false;
    if (fStatus !== 'todas' && c.status !== fStatus) return false;
    if (fCliente) {
      const p = people.find((pp) => pp.id === c.consignor_id);
      if (!(String(c.consignor_id) === fCliente.trim() || (p && p.name && p.name.toLowerCase().includes(fCliente.toLowerCase().trim())))) return false;
    }
    if (fIni && c.start_date < fIni) return false;
    if (fFim && c.start_date > fFim) return false;
    if (fValDe && cValor(c.id) < Number(fValDe)) return false;
    if (fValAte && cValor(c.id) > Number(fValAte)) return false;
    return true;
  });

  const limparFiltros = () => { setFControle(''); setFIni(''); setFFim(''); setFCliente(''); setFValDe(''); setFValAte(''); setFStatus('todas'); };

  // ---------- nova consignação ----------
  const newConsignment = async (e) => {
    e.preventDefault();
    if (!nc.consignor_id) { setMsg('Selecione o parceiro/cliente da consignação.'); return; }
    const userId = localStorage.getItem('userId');
    const { data, error } = await supabase.from('consignments').insert([{
      consignor_id: Number(nc.consignor_id),
      due_date: nc.due_date || null,
      notes: nc.notes || null,
      user_id: userId,
    }]).select().single();
    if (error) { setMsg('Erro ao criar: ' + error.message); return; }
    setNc({ consignor_id: '', due_date: '', notes: '' });
    setShowNova(false);
    setSelC(data.id);            // abre já na etapa de adicionar peças
    setMsg(`✅ Consignação #${data.id} criada. Adicione as peças abaixo.`);
    load();
  };

  // ---------- adicionar peças (leitura OU seleção manual) ----------
  const addItemToConsignment = async (itemId) => {
    if (!selC || !itemId) return;
    const already = cItems.some((x) => x.consignment_id === selC && x.item_id === itemId);
    if (already) { setMsg('Esta peça já está nesta consignação.'); return; }
    const { error } = await supabase.from('consignment_items').insert([{ consignment_id: selC, item_id: itemId }]);
    if (error) { setMsg('Erro ao adicionar peça: ' + error.message); return; }
    await supabase.rpc('set_item_status', { p_item_id: itemId, p_to_status: 'consignacao', p_reason: 'consignacao' });
    setAddItemId('');
    const it = itemById(itemId);
    setMsg(`Peça ${it?.barcode || itemId} adicionada à Consignação #${selC}.`);
    load();
  };

  const addToConsignment = (e) => { e.preventDefault(); addItemToConsignment(Number(addItemId)); };

  const handleCodigoLido = (codigo) => {
    const alvo = items.find((i) => i.barcode && String(i.barcode).replace(/[\s-]/g, '') === codigo);
    if (!alvo) { setMsg(`Código ${codigo} válido, mas nenhuma peça cadastrada o possui.`); return; }
    if (alvo.status !== 'estoque') { setMsg(`Peça ${codigo} está com status "${alvo.status}", não disponível para consignar.`); return; }
    addItemToConsignment(alvo.id);   // leitura adiciona direto, sem passo extra
  };

  const removePendingItem = async (ci) => {
    if (!window.confirm(`Remover a peça ${itemLabel(ci.item_id)} desta consignação? Ela volta para o estoque.`)) return;
    const { error } = await supabase.from('consignment_items').delete().eq('id', ci.id);
    if (error) setMsg('Erro: ' + error.message);
    else { await supabase.rpc('set_item_status', { p_item_id: ci.item_id, p_to_status: 'estoque', p_reason: 'consignacao_cancelada_item' }); setMsg('Peça retirada da consignação e devolvida ao estoque.'); load(); }
  };

  // ---------- devoluções / acerto / encerrar / cancelar ----------
  const returnItem = async (ci) => {
    const { error } = await supabase.from('consignment_items')
      .update({ returned: true, returned_at: new Date().toISOString() })
      .eq('id', ci.id);
    if (error) setMsg('Erro: ' + error.message);
    else { await supabase.rpc('set_item_status', { p_item_id: ci.item_id, p_to_status: 'estoque', p_reason: 'consignacao_devolvida' }); setMsg('Peça devolvida ao estoque.'); load(); }
  };

  const chargePending = async (c) => {
    const pend = cPend(c.id);
    if (!pend.length) { setMsg('Nenhuma peça pendente para acertar.'); return; }
    const total = cValor(c.id);
    if (!window.confirm(`ACERTO da Consignação #${c.id}\n\n${pend.length} peça(s) não devolvidas serão cobradas como venda:\n${pend.map((x) => '• ' + itemLabel(x.item_id)).join('\n')}\n\nTotal: R$ ${total.toFixed(2)}\n\nConfirmar acerto?`)) return;
    setMsg('Registrando acerto…');
    try {
      const rows = pend.map((x) => itemById(x.item_id)).filter(Boolean);
      const { data: sale, error: e1 } = await supabase.from('sales').insert([{
        customer_id: c.consignor_id, consignment_id: c.id, total_amount: total,
        payment_method: 'acerto_consignacao',
        notes: `Acerto de consignação não devolvida — Consignação #${c.id}`,
        user_id: localStorage.getItem('userId'),
      }]).select().single();
      if (e1) throw new Error(e1.message);
      for (const it of rows) {
        await supabase.from('sale_items').insert([{ sale_id: sale.id, item_id: it.id, unit_value: Number(it.price_sale || 0) }]);
        await supabase.rpc('set_item_status', { p_item_id: it.id, p_to_status: 'vendido', p_reason: 'acerto_consignacao' });
        await supabase.rpc('mark_consignment_item_sold', { p_item_id: it.id });
      }
      await supabase.from('consignments').update({ status: 'encerrada', end_date: new Date().toISOString().slice(0, 10) }).eq('id', c.id);
      setMsg(`✅ Acerto registrado como Venda ${sale.code} — R$ ${total.toFixed(2)}.`);
      setSelC(null);
    } catch (err) { setMsg('Erro: ' + err.message); }
    load();
  };

  const closeConsignment = async (c) => {
    const pend = cPend(c.id);
    if (pend.length && !window.confirm(`Atenção: ${pend.length} peça(s) NÃO devolvidas. Clique OK para ENCERRAR sem cobrar (use depois o Acerto), ou Cancelar.`)) return;
    const { error } = await supabase.from('consignments').update({ status: 'encerrada' }).eq('id', c.id);
    if (error) setMsg('Erro: ' + error.message);
    else { setMsg(`Consignação #${c.id} encerrada.`); setSelC(null); load(); }
  };

  const cancelConsignment = async (c) => {
    const pend = cPend(c.id);
    if (!window.confirm(`CANCELAR a Consignação #${c.id}? As ${pend.length} peça(s) ainda não devolvidas voltarão para o estoque.`)) return;
    for (const x of pend) {
      await supabase.rpc('set_item_status', { p_item_id: x.item_id, p_to_status: 'estoque', p_reason: 'consignacao_cancelada' });
    }
    await supabase.from('consignment_items').delete().eq('consignment_id', c.id).eq('returned', false).eq('sold', false);
    const { error } = await supabase.from('consignments').update({ status: 'cancelada' }).eq('id', c.id);
    if (error) setMsg('Erro: ' + error.message);
    else { setMsg(`Consignação #${c.id} cancelada; peças devolvidas ao estoque.`); setSelC(null); load(); }
  };

  // Excluir definitivamente (admin): remove a consignação e devolve as peças em poder ao estoque
  const deleteConsignment = async (c) => {
    if (localStorage.getItem('userRole') !== 'administrador') { setMsg('Apenas administradores podem excluir consignações.'); return; }
    const pend = cPend(c.id);
    const ok = window.confirm(
      `EXCLUIR DEFINITIVAMENTE a Consignação #${c.id} (${c.code || ''})?\n\n` +
      `${pend.length} peça(s) em poder do parceiro voltarão para o estoque.\n` +
      `Peças já devolvidas ou vendidas NÃO são alteradas.\n\nEsta ação não pode ser desfeita.`
    );
    if (!ok) return;
    const { data, error } = await supabase.rpc('delete_consignment', { p_id: c.id });
    if (error) setMsg('Erro ao excluir: ' + error.message);
    else { setMsg(data || 'Consignação excluída.'); if (selC === c.id) setSelC(null); load(); }
  };

  // Romaneio: janela de impressão da lista de peças — estilo da landing page
  // (Magenta Vinho #8E2A6E, Cormorant Garamond + DM Sans, bordas suaves)
  const printRomaneio = (c) => {
    const list = cItems.filter((x) => x.consignment_id === c.id);
    const linhas = list.map((x) => { const it = itemById(x.item_id); const st = x.sold ? 'Vendida' : x.returned ? 'Devolvida' : 'Em poder'; return `<tr><td>${it?.barcode || x.item_id}${it && ehCodigoLegado(it.barcode) ? '*' : ''}</td><td>${modelName(it)}</td><td>R$ ${Number(it?.price_sale || 0).toFixed(2)}</td><td class="st">${st}</td></tr>`; }).join('');
    const w = window.open('', '_blank', 'width=700,height=600');
    w.document.write(`<html><head><title>Romaneio Consignação #${c.id}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
      <style>
        :root { --primary:#8E2A6E; --foreground:#4a3145; --muted-foreground:#8a7484; --border:#e6d9e2; --accent:#f6ecf3; }
        * { box-sizing: border-box; }
        body { font-family:'DM Sans',sans-serif; color:var(--foreground); background:#fff; margin:0; padding:32px 36px; font-size:13px; -webkit-font-smoothing:antialiased; }
        .eyebrow { color:var(--primary); font-size:10px; font-weight:600; letter-spacing:2.2px; text-transform:uppercase; display:flex; align-items:center; gap:10px; }
        .eyebrow::before { content:''; width:23px; height:1px; background:var(--primary); }
        h3.doc-title { font-family:'Cormorant Garamond',serif; font-weight:500; font-size:34px; line-height:1.05; margin:8px 0 4px; color:var(--foreground); }
        .meta { color:var(--muted-foreground); font-size:12px; margin:0 0 22px; }
        .meta b { color:var(--foreground); font-weight:500; }
        table { border-collapse:collapse; width:100%; }
        th { text-align:left; font-size:10px; letter-spacing:1.6px; text-transform:uppercase; color:var(--primary); border-bottom:1px solid var(--primary); padding:8px 10px; font-weight:600; }
        td { border-bottom:1px solid var(--border); padding:9px 10px; font-size:13px; }
        tbody tr:nth-child(even) td { background:var(--accent); }
        td.st { color:var(--muted-foreground); font-size:12px; }
        tfoot td { border:none; padding-top:16px; font-size:13px; }
        .total { color:var(--primary); font-weight:600; }
        .assinaturas { display:grid; grid-template-columns:1fr 1fr; gap:48px; margin-top:64px; }
        .assinaturas div { border-top:1px solid var(--border); padding-top:8px; text-align:center; font-size:11px; color:var(--muted-foreground); letter-spacing:.4px; }
        @media print { body { padding:0; } }
      </style></head><body>
      <div class="eyebrow">MAGENTA VINHO</div>
      <h3 class="doc-title">Romaneio — Consignação #${c.id}</h3>
      <p class="meta"><b>Parceiro:</b> ${personName(c.consignor_id)} &nbsp;·&nbsp; <b>Início:</b> ${c.start_date} &nbsp;·&nbsp; <b>Prazo:</b> ${c.due_date || '—'} &nbsp;·&nbsp; <b>Status:</b> ${c.status}</p>
      <table><thead><tr><th>Código</th><th>Modelo</th><th>Valor</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody>
        <tfoot><tr><td colspan="4"><span class="total">Total em poder: R$ ${cValor(c.id).toFixed(2)}</span> (${cPend(c.id).length} peça(s))</td></tr></tfoot>
      </table>
      <div class="assinaturas"><div>Assinatura — Loja</div><div>Assinatura — Parceiro</div></div>
      <p style="font-size:10px;color:#6b5a66;margin-top:8px">* Código legado (etiqueta antiga) — será substituído por código do sistema quando o estoque zerar.</p>
      <script>window.print()</script></body></html>`);
    w.document.close();
  };

  const activeItems = items.filter((i) => i.status === 'estoque');
  const detailItems = cItems.filter((x) => x.consignment_id === selC && !x.returned && !x.sold);
  const selObj = consignments.find((c) => c.id === selC);

  return (
    <div className="cad-container">
      <BackBar title="Consignações" />
      <h2>Pesquisa de Consignações</h2>
      {erro && <p className="cad-msg" style={{ color: '#c0392b' }}>{erro}</p>}

      {/* ----- FILTROS (como na tela antiga) ----- */}
      <div className="cad-block">
        <div className="cad-form people-form" style={{ alignItems: 'flex-end' }}>
          <label>Controle <input placeholder="nº" value={fControle} onChange={(e) => setFControle(e.target.value)} /></label>
          <label>Data inicial <input type="date" value={fIni} onChange={(e) => setFIni(e.target.value)} /></label>
          <label>Data final <input type="date" value={fFim} onChange={(e) => setFFim(e.target.value)} /></label>
          <label>Cliente
            <select value={fCliente} onChange={(e) => setFCliente(e.target.value)}>
              <option value="">Todos</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Status
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="todas">Todas</option>
              <option value="ativa">🟢 Ativas</option>
              <option value="encerrada">⚪ Encerradas</option>
              <option value="cancelada">🚫 Canceladas</option>
            </select>
          </label>
          <label>Valor de R$ <input type="number" min="0" step="0.01" value={fValDe} onChange={(e) => setFValDe(e.target.value)} /></label>
          <label>até R$ <input type="number" min="0" step="0.01" value={fValAte} onChange={(e) => setFValAte(e.target.value)} /></label>
        </div>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button onClick={() => load()}>🔍 Pesquisar</button>
          <button onClick={limparFiltros}>❌ Limpar filtros</button>
          <button onClick={() => setShowNova(!showNova)}>➕ Inserir consignação</button>
          <button onClick={() => { setFStatus('ativa'); }}>📋 Pendências</button>
        </div>
        {msg && <p className="cad-msg">{msg}</p>}
      </div>

      {/* ----- NOVA CONSIGNAÇÃO ----- */}
      {showNova && (
        <div className="cad-block">
          <h3>Nova Consignação</h3>
          <form onSubmit={newConsignment} className="cad-form people-form">
            <select value={nc.consignor_id} onChange={(e) => setNc({ ...nc, consignor_id: e.target.value })}>
              <option value="">Parceiro/Cliente…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label>Prazo: <input type="date" value={nc.due_date} onChange={(e) => setNc({ ...nc, due_date: e.target.value })} /></label>
            <input placeholder="Observações" value={nc.notes} onChange={(e) => setNc({ ...nc, notes: e.target.value })} />
            <button type="submit">Salvar e adicionar peças</button>
            <button type="button" onClick={() => setShowNova(false)}>Cancelar</button>
          </form>
        </div>
      )}

      {/* ----- GRADE DE PESQUISA ----- */}
      <div className="cad-block">
        <h3>Consignações ({filtradas.length})</h3>
        <table className="cad-table">
          <thead><tr><th>Controle</th><th>Cliente</th><th>Tipo</th><th>Data</th><th>Prazo</th><th>Acerto em</th><th>Peças</th><th>Valor R$</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {filtradas.map((c) => (
              <tr key={c.id} style={selC === c.id ? { background: '#fff8e1' } : undefined}>
                <td data-label="Controle"><b>{c.id}</b></td>
                <td data-label="Cliente">{personName(c.consignor_id)}</td>
                <td data-label="Tipo">Joias</td>
                <td data-label="Data">{c.start_date}</td>
                <td data-label="Prazo">{c.due_date || '—'}</td>
                <td data-label="Acerto">{c.end_date || '—'}</td>
                <td data-label="Peças">{cPend(c.id).length}/{cTotal(c.id)}</td>
                <td data-label="Valor">R$ {cValor(c.id).toFixed(2)}</td>
                <td data-label="Status">{c.status === 'ativa' ? '🟢 Ativa' : c.status === 'cancelada' ? '🚫 Cancelada' : '⚪ Encerrada'}</td>
                <td data-label="Ações">
                  <div className="btn-group">
                    <button onClick={() => setSelC(c.id)}>Selecionar</button>
                    <button onClick={() => printRomaneio(c)}>🖨 Romaneio</button>
                    {c.status === 'ativa' && cPend(c.id).length > 0 && <button onClick={() => chargePending(c)}>💰 Acerto</button>}
                    {c.status === 'ativa' && <button onClick={() => closeConsignment(c)}>Encerrar</button>}
                    {c.status === 'ativa' && <button onClick={() => cancelConsignment(c)}>Cancelar</button>}
                    {localStorage.getItem('userRole') === 'administrador' && <button onClick={() => deleteConsignment(c)} style={{ color: '#c0392b' }}>🗑 Excluir</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!filtradas.length && <tr><td colSpan={10}>Nenhuma consignação encontrada com estes filtros.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ----- ITENS DA CONSIGNAÇÃO SELECIONADA ----- */}
      {selObj && (
        <div className="cad-block">
          <h3>Consignação #{selObj.id} — {personName(selObj.consignor_id)}</h3>

          {selObj.status === 'ativa' && (
            <>
              <p><b>Adicionar peças</b> — leia a etiqueta com a câmera/leitor (entra direto) ou selecione manualmente:</p>
              <LeitorCodigo onCodigo={handleCodigoLido} />
              <form onSubmit={addToConsignment} className="cad-form people-form" style={{ marginTop: 8 }}>
                <select value={addItemId} onChange={(e) => setAddItemId(e.target.value)}>
                  <option value="">Selecionar peça em estoque…</option>
                  {activeItems.map((i) => <option key={i.id} value={i.id}>{itemLabel(i.id)} — {modelName(i)} — R$ {Number(i.price_sale || 0).toFixed(2)}</option>)}
                </select>
                <button type="submit">Adicionar à Consignação</button>
              </form>
            </>
          )}

          <h4 style={{ marginTop: 16 }}>Peças em poder do parceiro ({detailItems.length})</h4>
          <table className="cad-table">
            <thead><tr><th>Código</th><th>Modelo</th><th>Valor</th><th>Ações</th></tr></thead>
            <tbody>
              {detailItems.map((x) => { const it = itemById(x.item_id); return (
                <tr key={x.id}>
                  <td data-label="Código">{itemLabel(x.item_id)}</td>
                  <td data-label="Modelo">{modelName(it)}</td>
                  <td data-label="Valor">R$ {Number(it?.price_sale || 0).toFixed(2)}</td>
                  <td data-label="Ações">
                    <div className="btn-group">
                      <button onClick={() => returnItem(x)}>↩ Devolver</button>
                      <button onClick={() => removePendingItem(x)}>✕ Remover</button>
                    </div>
                  </td>
                </tr>); })}
              {!detailItems.length && <tr><td colSpan={4}>Nenhuma peça pendente.</td></tr>}
            </tbody>
          </table>

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button onClick={() => printRomaneio(selObj)}>🖨 Romaneio</button>
            {selObj.status === 'ativa' && detailItems.length > 0 && <button onClick={() => chargePending(selObj)}>💰 Acerto (cobrar não devolvidas)</button>}
            <button onClick={() => setSelC(null)}>Fechar seleção</button>
          </div>
        </div>
      )}
    </div>
  );
}
