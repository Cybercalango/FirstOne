import React, { useState, useEffect } from 'react';
import BackBar from '../components/BackBar';
import LeitorCodigo from '../components/LeitorCodigo';
import { supabase } from '../supabaseClient';

// Consignação: remessa formal de peças a um parceiro/vendedor, com prazo e baixa de devoluções
export default function Consignacoes() {
  const [consignments, setConsignments] = useState([]);
  const [cItems, setCItems] = useState([]);
  const [people, setPeople] = useState([]);
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState('');
  const [selC, setSelC] = useState(null);
  const [nc, setNc] = useState({ consignor_id: '', due_date: '', notes: '' });
  const [addItemId, setAddItemId] = useState('');

  // Leitura por código: seleciona a peça em estoque para adicionar à consignação
  const handleCodigoLido = (codigo) => {
    const alvo = items.find((i) => i.barcode && String(i.barcode).replace(/[\s-]/g, '') === codigo);
    if (!alvo) { setMsg(`Código ${codigo} válido, mas nenhuma peça cadastrada o possui.`); return; }
    if (alvo.status !== 'estoque') { setMsg(`Peça ${codigo} está com status "${alvo.status}", não disponível em estoque.`); return; }
    setAddItemId(String(alvo.id));
    setMsg(`Peça ${codigo} selecionada para a consignação.`);
  };

  const load = async () => {
    const [co, ci, pe, im] = await Promise.all([
      supabase.from('consignments').select('*').order('id', { ascending: false }),
      supabase.from('consignment_items').select('*'),
      supabase.from('people').select('*').order('name'),
      supabase.from('items').select('*').order('id', { ascending: false }),
    ]);
    setConsignments(co.data || []); setCItems(ci.data || []);
    setPeople(pe.data || []); setItems(im.data || []);
  };
  useEffect(() => { load(); }, []);

  const newConsignment = async (e) => {
    e.preventDefault();
    if (!nc.consignor_id) { setMsg('Selecione o parceiro.'); return; }
    const userId = localStorage.getItem('userId');
    const { data, error } = await supabase.from('consignments').insert([{
      consignor_id: Number(nc.consignor_id),
      due_date: nc.due_date || null,
      notes: nc.notes || null,
      user_id: userId,
    }]).select().single();
    if (error) setMsg('Erro: ' + error.message);
    else { setNc({ consignor_id: '', due_date: '', notes: '' }); setMsg(`Consignação #${data.id} criada! Agora adicione as peças.`); setSelC(data.id); load(); }
  };

  const addToConsignment = async (e) => {
    e.preventDefault();
    if (!selC || !addItemId) { setMsg('Selecione a consignação e a peça.'); return; }
    const already = cItems.some((x) => x.consignment_id === selC && x.item_id === Number(addItemId));
    if (already) { setMsg('Peça já está nesta consignação.'); return; }
    const { error } = await supabase.from('consignment_items').insert([{
      consignment_id: selC, item_id: Number(addItemId),
    }]);
    if (error) setMsg('Erro: ' + error.message);
    else {
      await supabase.rpc('set_item_status', { p_item_id: Number(addItemId), p_to_status: 'consignacao', p_reason: 'consignacao' });
      setAddItemId(''); setMsg('Peça adicionada à consignação.'); load();
    }
  };

  const returnItem = async (ci) => {
    const { error } = await supabase.from('consignment_items')
      .update({ returned: true, returned_at: new Date().toISOString() })
      .eq('id', ci.id);
    if (error) setMsg('Erro: ' + error.message);
    else {
      await supabase.rpc('set_item_status', { p_item_id: ci.item_id, p_to_status: 'estoque', p_reason: 'consignacao_devolvida' });
      setMsg('Peça devolvida ao estoque.'); load();
    }
  };

  const closeConsignment = async (c) => {
    const pend = cItems.filter((x) => x.consignment_id === c.id && !x.returned && !x.sold);
    if (pend.length && !window.confirm(`Atenção: ${pend.length} peça(s) NÃO devolvidas. Clique OK para ENCERRAR mesmo assim e depois cobrá-las em Vendas, ou Cancelar para não encerrar.`)) return;
    const { error } = await supabase.from('consignments')
      .update({ status: 'encerrada' }).eq('id', c.id);
    if (error) setMsg('Erro: ' + error.message);
    else { setMsg(`Consignação #${c.id} encerrada.`); setSelC(null); load(); }
  };

  // Cobrança de itens não devolvidos: gera uma venda por consignação com
  // todas as peças pendentes (saíram em consignação, agora são faturadas).
  const chargePending = async (c) => {
    const pend = cItems.filter((x) => x.consignment_id === c.id && !x.returned && !x.sold);
    if (!pend.length) { setMsg('Nenhuma peça pendente para cobrar.'); return; }
    if (!window.confirm(`Cobrar ${pend.length} peça(s) não devolvidas da Consignação #${c.id}?`)) return;
    setMsg('Registrando cobrança…');
    try {
      const rows = pend.map((x) => items.find((i) => i.id === x.item_id)).filter(Boolean);
      const total = rows.reduce((s, i) => s + Number(i.price_sale || 0), 0);
      const { data: sale, error: e1 } = await supabase.from('sales').insert([{
        customer_id: c.consignor_id,
        consignment_id: c.id,
        total_amount: total,
        payment_method: 'cobranca_consignacao',
        notes: `Cobrança de itens não devolvidos — Consignação #${c.id}`,
        user_id: localStorage.getItem('userId'),
      }]).select().single();
      if (e1) throw new Error(e1.message);
      for (const it of rows) {
        await supabase.from('sale_items').insert([{ sale_id: sale.id, item_id: it.id, unit_value: Number(it.price_sale || 0) }]);
        await supabase.rpc('set_item_status', { p_item_id: it.id, p_to_status: 'vendido', p_reason: 'cobranca_consignacao' });
        await supabase.rpc('mark_consignment_item_sold', { p_item_id: it.id });
      }
      await supabase.from('consignments').update({ status: 'encerrada', end_date: new Date().toISOString().slice(0, 10) }).eq('id', c.id);
      setMsg(`✅ Cobrança registrada como Venda ${sale.code} — R$ ${total.toFixed(2)}.`);
      setSelC(null);
    } catch (err) { setMsg('Erro: ' + err.message); }
    load();
  };

  const personName = (id) => (people.find((p) => p.id === id) || {}).name || '—';
  const itemLabel = (id) => {
    const it = items.find((x) => x.id === id);
    return it ? `${it.barcode || 'ID ' + it.id}` : `#${id}`;
  };
  const activeItems = items.filter((i) => i.status === 'estoque');
  const detailItems = cItems.filter((x) => x.consignment_id === selC && !x.returned && !x.sold);

  return (
    <div className="cad-container">
      <BackBar title="Consignações" />
      <h2>Consignações</h2>

      <div className="cad-block">
        <h3>Nova Consignação</h3>
        <form onSubmit={newConsignment} className="cad-form people-form">
          <select value={nc.consignor_id} onChange={(e) => setNc({ ...nc, consignor_id: e.target.value })}>
            <option value="">Parceiro/Vendedor…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label>Prazo: <input type="date" value={nc.due_date} onChange={(e) => setNc({ ...nc, due_date: e.target.value })} /></label>
          <input placeholder="Observações" value={nc.notes} onChange={(e) => setNc({ ...nc, notes: e.target.value })} />
          <button type="submit">Criar Consignação</button>
        </form>
        {msg && <p className="cad-msg">{msg}</p>}
      </div>

      {selC && (
        <div className="cad-block">
          <h3>Adicionar peças à Consignação #{selC}</h3>
          <LeitorCodigo onCodigo={handleCodigoLido} />
          <form onSubmit={addToConsignment} className="cad-form people-form">
            <select value={addItemId} onChange={(e) => setAddItemId(e.target.value)}>
              <option value="">Selecionar peça em estoque…</option>
              {activeItems.map((i) => <option key={i.id} value={i.id}>{itemLabel(i.id)} — R$ {Number(i.price_sale).toFixed(2)}</option>)}
            </select>
            <button type="submit">Adicionar à Consignação</button>
          </form>
        </div>
      )}

      <div className="cad-block">
        <h3>Consignações</h3>
        <table className="cad-table">
          <thead><tr><th>#</th><th>Parceiro</th><th>Início</th><th>Prazo</th><th>Peças</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {consignments.map((c) => {
              const total = cItems.filter((x) => x.consignment_id === c.id).length;
              const pend = cItems.filter((x) => x.consignment_id === c.id && !x.returned && !x.sold);
              return (
                <tr key={c.id}>
                  <td data-label="#">{c.id}</td>
                  <td data-label="Parceiro">{personName(c.consignor_id)}</td>
                  <td data-label="Início">{c.start_date}</td>
                  <td data-label="Prazo">{c.due_date || '—'}</td>
                  <td data-label="Peças">{pend.length}/{total} em poder</td>
                  <td data-label="Status">{c.status === 'ativa' ? '🟢 Ativa' : '⚪ Encerrada'}</td>
                  <td data-label="Ações">
                    <button onClick={() => setSelC(c.id)}>Ver/Adicionar</button>
                    {c.status === 'ativa' && pend.length > 0 && <button onClick={() => chargePending(c)}>💰 Cobrar não devolvidas</button>}
                    {c.status === 'ativa' && <button onClick={() => closeConsignment(c)}>Encerrar</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selC && (
        <div className="cad-block">
          <h3>Peças pendentes na Consignação #{selC}</h3>
          <table className="cad-table">
            <thead><tr><th>Peça</th><th></th></tr></thead>
            <tbody>
              {detailItems.map((x) => (
                <tr key={x.id}>
                  <td data-label="Peça">{itemLabel(x.item_id)}</td>
                  <td data-label="Ação"><button onClick={() => returnItem(x)}>Registrar Devolução</button></td>
                </tr>
              ))}
              {!detailItems.length && <tr><td colSpan={2}>Nenhuma peça pendente.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
