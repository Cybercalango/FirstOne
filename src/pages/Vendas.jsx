import React, { useState, useEffect, useMemo } from 'react';
import BackBar from '../components/BackBar';
import LeitorCodigo from '../components/LeitorCodigo';
import { supabase } from '../supabaseClient';

// PDV mobile-first: leitura de etiqueta (câmera/leitor), busca de peça,
// carrinho com listagem, cobrança e registro da venda.
// A venda alimenta os Relatórios e dá baixa no status da peça (estoque -> vendido).
export default function Vendas() {
  const [items, setItems] = useState([]);
  const [people, setPeople] = useState([]);
  const [cart, setCart] = useState([]);           // itens selecionados (objeto item)
  const [busca, setBusca] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [payment, setPayment] = useState('dinheiro');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSale, setLastSale] = useState(null);

  const load = async () => {
    const [im, pe] = await Promise.all([
      supabase.from('items').select('*').order('id', { ascending: false }),
      supabase.from('people').select('*').order('name'),
    ]);
    setItems(im.data || []);
    setPeople(pe.data || []);
  };
  useEffect(() => { load(); }, []);

  const available = items.filter((i) => i.status === 'estoque');
  const total = cart.reduce((s, i) => s + Number(i.price_sale || 0), 0);

  // Busca por código interno (8 dígitos), nome/descrição ou preço
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const results = useMemo(() => {
    const q = norm(busca.trim());
    if (!q) return [];
    return available.filter((i) =>
      (i.barcode && String(i.barcode).replace(/[\s-]/g, '').includes(q)) ||
      norm(i.name).includes(q) ||
      norm(i.description).includes(q) ||
      String(i.id) === q ||
      ('r$ ' + Number(i.price_sale || 0).toFixed(2)).includes(q)
    ).slice(0, 12);
  }, [busca, available]);

  const addItem = (it) => {
    if (!it) return;
    if (cart.some((c) => c.id === it.id)) { setMsg('Peça já está na lista.'); return; }
    setCart([...cart, it]);
    setMsg('');
  };

  const removeItem = (id) => setCart(cart.filter((c) => c.id !== id));

  // Chamado pelo LeitorCodigo (câmera ou leitor USB/teclado)
  const handleCodigoLido = (codigo) => {
    const alvo = available.find((i) => i.barcode && String(i.barcode).replace(/[\s-]/g, '') === codigo);
    if (!alvo) { setMsg(`Código ${codigo} válido, mas nenhuma peça em estoque o possui.`); return; }
    addItem(alvo);
    setBusca('');
  };

  const newCustomer = async () => {
    const name = window.prompt('Nome do novo cliente:');
    if (!name || !name.trim()) return;
    const phone = window.prompt('Telefone (opcional):') || '';
    const { data, error } = await supabase.from('people')
      .insert([{ name: name.trim(), phone: phone.trim() || null, is_client: true }])
      .select().single();
    if (error) setMsg('Erro ao criar cliente: ' + error.message);
    else { setPeople((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name))); setCustomerId(String(data.id)); setMsg(`Cliente "${data.name}" criado(a).`); }
  };

  const finishSale = async () => {
    if (!cart.length) { setMsg('Adicione ao menos uma peça.'); return; }
    setSaving(true);
    try {
      const userId = localStorage.getItem('userId');
      const { data: sale, error: e1 } = await supabase.from('sales').insert([{
        customer_id: customerId ? Number(customerId) : null,
        total_amount: total,
        payment_method: payment,
        notes: notes || '',
        user_id: userId,
      }]).select().single();
      if (e1) throw new Error(e1.message);

      for (const it of cart) {
        const { error: e2 } = await supabase.from('sale_items').insert([{
          sale_id: sale.id, item_id: it.id, unit_value: Number(it.price_sale || 0),
        }]);
        if (e2) throw new Error('Item: ' + e2.message);
        await supabase.rpc('set_item_status', { p_item_id: it.id, p_to_status: 'vendido', p_reason: 'venda' });
      }
      const cliente = people.find((p) => String(p.id) === customerId);
      setLastSale({ code: sale.code, total, pieces: cart.length, payment, cliente: cliente?.name || 'Sem cliente' });
      setCart([]); setNotes('');
      setMsg('');
    } catch (err) {
      setMsg('Erro: ' + err.message);
    } finally {
      setSaving(false);
      load();
    }
  };

  const cancelSale = () => {
    if (!cart.length) return;
    if (window.confirm('Cancelar esta venda? Os itens selecionados voltarão para zero.')) {
      setCart([]); setNotes(''); setMsg('Venda cancelada.');
    }
  };

  return (
    <div className="cad-container">
      <BackBar title="Vendas" />
      <h2>💰 Vendas (PDV)</h2>

      {lastSale && (
        <div className="sale-receipt">
          <strong>✅ Venda {lastSale.code} registrada</strong><br />
          {lastSale.pieces} peça(s) — R$ {lastSale.total.toFixed(2)} — {lastSale.payment}<br />
          Cliente: {lastSale.cliente}
          <button type="button" onClick={() => setLastSale(null)}>Fechar recibo</button>
        </div>
      )}

      <div className="cad-block">
        <h3>Selecionar peça em estoque</h3>
        <LeitorCodigo onCodigo={handleCodigoLido} />
        <p style={{ margin: '8px 0', color: '#666', fontSize: 13 }}>ou busque manualmente ({available.length} disponíveis):</p>
        <input
          placeholder="Buscar por código, nome ou preço…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {busca.trim() && (
          <ul className="venda-results">
            {results.map((i) => (
              <li key={i.id}>
                <span>{i.barcode || 'ID ' + i.id} — {i.name || 'Peça'}<small>R$ {Number(i.price_sale || 0).toFixed(2)}</small></span>
                <button type="button" onClick={() => { addItem(i); setBusca(''); }}>+ Adicionar</button>
              </li>
            ))}
            {!results.length && <li className="empty">Nenhuma peça em estoque encontrada.</li>}
          </ul>
        )}
        {msg && <p className="cad-msg">{msg}</p>}
      </div>

      <div className="cad-block">
        <h3>Itens da venda ({cart.length})</h3>
        <table className="cad-table">
          <thead><tr><th>Código</th><th>Peça</th><th>Preço</th><th></th></tr></thead>
          <tbody>
            {cart.map((i) => (
              <tr key={i.id}>
                <td data-label="Código">{i.barcode || 'ID ' + i.id}</td>
                <td data-label="Peça">{i.name || '—'}</td>
                <td data-label="Preço">R$ {Number(i.price_sale || 0).toFixed(2)}</td>
                <td data-label="Ação"><button className="del-btn" onClick={() => removeItem(i.id)}>✕</button></td>
              </tr>
            ))}
            {!cart.length && <tr><td colSpan={4}>Nenhuma peça selecionada.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="cad-block">
        <h3>Cobrança</h3>
        <form onSubmit={(e) => { e.preventDefault(); finishSale(); }} className="cad-form people-form">
          <label>Cliente:
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Sem cliente identificado</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={newCustomer}>+ Novo cliente</button>
          <label>Pagamento:
            <select value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">Pix</option>
              <option value="cartao">Cartão</option>
              <option value="outro">Outro</option>
            </select>
          </label>
          <input placeholder="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="sale-total">TOTAL: R$ {total.toFixed(2)}</div>
          <button type="submit" disabled={saving || !cart.length}>
            {saving ? 'Registrando…' : `Finalizar Venda (${cart.length})`}
          </button>
          <button type="button" className="cancel-btn" onClick={cancelSale} disabled={!cart.length}>Cancelar</button>
        </form>
      </div>
    </div>
  );
}
