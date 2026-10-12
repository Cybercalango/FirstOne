import React, { useState, useEffect } from 'react';
import BackBar from '../components/BackBar';
import { supabase } from '../supabaseClient';

// Entrada e saída de estoque (empréstimo/devolução a vendedores e parceiros)
export default function Movimentacoes() {
  const [items, setItems] = useState([]);
  const [people, setPeople] = useState([]);
  const [movements, setMovements] = useState([]);
  const [msg, setMsg] = useState('');
  const [mv, setMv] = useState({ item_id: '', person_id: '', type: 'saida', notes: '' });

  const load = async () => {
    const [im, pe, mo] = await Promise.all([
      supabase.from('items').select('*').order('id', { ascending: false }),
      supabase.from('people').select('*').order('name'),
      supabase.from('stock_movements').select('*').order('id', { ascending: false }).limit(200),
    ]);
    setItems(im.data || []); setPeople(pe.data || []); setMovements(mo.data || []);
  };
  useEffect(() => { load(); }, []);

  const available = items.filter((i) => mv.type === 'saida'
    ? i.status === 'estoque'
    : true);

  const submit = async (e) => {
    e.preventDefault();
    if (!mv.item_id || !mv.person_id) { setMsg('Selecione a peça e o responsável.'); return; }
    const userId = localStorage.getItem('userId');
    const { error } = await supabase.from('stock_movements').insert([{
      item_id: Number(mv.item_id), person_id: Number(mv.person_id),
      type: mv.type, quantity: 1, notes: mv.notes || null, user_id: userId,
    }]);
    if (error) { setMsg('Erro: ' + error.message); return; }
    const newStatus = mv.type === 'saida' ? 'emprestado' : 'estoque';
    const { error: err2 } = await supabase.rpc('set_item_status', {
      p_item_id: Number(mv.item_id), p_to_status: newStatus, p_reason: mv.type,
    });
    if (err2) setMsg('Movimento registrado, mas houve erro ao atualizar o item: ' + err2.message);
    else setMsg(mv.type === 'saida' ? 'Saída registrada! Peça emprestada.' : 'Entrada registrada! Peça devolvida ao estoque.');
    setMv({ item_id: '', person_id: '', type: mv.type, notes: '' });
    load();
  };

  const itemName = (id) => {
    const it = items.find((x) => x.id === id);
    return it ? `${it.barcode || 'ID ' + it.id}` : '—';
  };
  const personName = (id) => (people.find((p) => p.id === id) || {}).name || '—';

  return (
    <div className="cad-container">
      <BackBar title="Movimentações de Estoque" />
      <h2>Movimentações de Estoque</h2>
      <div className="cad-block">
        <h3>Registrar Entrada / Saída</h3>
        <form onSubmit={submit} className="cad-form people-form">
          <select value={mv.type} onChange={(e) => setMv({ ...mv, type: e.target.value })}>
            <option value="saida">Saída (emprestar peça)</option>
            <option value="entrada">Entrada (devolução ao estoque)</option>
          </select>
          <select value={mv.item_id} onChange={(e) => setMv({ ...mv, item_id: e.target.value })}>
            <option value="">Selecionar peça…</option>
            {available.map((i) => (
              <option key={i.id} value={i.id}>
                {i.barcode || 'ID ' + i.id} — {i.status}
              </option>
            ))}
          </select>
          <select value={mv.person_id} onChange={(e) => setMv({ ...mv, person_id: e.target.value })}>
            <option value="">Responsável…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input placeholder="Observações" value={mv.notes} onChange={(e) => setMv({ ...mv, notes: e.target.value })} />
          <button type="submit">Registrar</button>
        </form>
        {msg && <p className="cad-msg">{msg}</p>}
      </div>

      <div className="cad-block">
        <h3>Histórico de Movimentações</h3>
        <table className="cad-table">
          <thead><tr><th>Data</th><th>Tipo</th><th>Peça</th><th>Responsável</th><th>Obs.</th></tr></thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td data-label="Data">{new Date(m.created_at).toLocaleString('pt-BR')}</td>
                <td data-label="Tipo">{m.type === 'saida' ? '⬆️ Saída' : '⬇️ Entrada'}</td>
                <td data-label="Peça">{itemName(m.item_id)}</td>
                <td data-label="Responsável">{personName(m.person_id)}</td>
                <td data-label="Obs.">{m.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
