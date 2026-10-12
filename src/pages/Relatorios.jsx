import React, { useState, useEffect } from 'react';
import BackBar from '../components/BackBar';
import { supabase } from '../supabaseClient';

// Relatórios de vendas: filtro por período e vendedor, totais e lista detalhada.
export default function Relatorios() {
  const [sales, setSales] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [people, setPeople] = useState([]);
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [seller, setSeller] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      let q = supabase.from('sales').select('*')
        .gte('created_at', from + 'T00:00:00')
        .lte('created_at', to + 'T23:59:59')
        .order('created_at', { ascending: false });
      if (seller) q = q.eq('user_id', seller);
      const [sa, pr, pe] = await Promise.all([
        q,
        supabase.from('profiles').select('id, nome, email'),
        supabase.from('people').select('id, name'),
      ]);
      if (sa.error) throw new Error(sa.error.message);
      setSales(sa.data || []);
      setProfiles(pr.data || []);
      setPeople(pe.data || []);
    } catch (e) { setMsg('Erro: ' + e.message); }
  };
  useEffect(() => { load(); }, [from, to, seller]);

  const total = sales.reduce((s, v) => s + Number(v.total_amount || 0), 0);
  const avg = sales.length ? total / sales.length : 0;
  const sellerName = (id) => {
    const p = profiles.find((x) => x.id === id);
    return p ? (p.nome || p.email) : (id ? 'Usuário removido' : '—');
  };
  const customerName = (id) => (people.find((x) => x.id === id) || {}).name || 'Avulso';

  return (
    <div className="cad-container">
      <BackBar title="Relatórios" />
      <h2>📊 Relatórios de Vendas</h2>

      <div className="cad-block">
        <h3>Filtros</h3>
        <div className="cad-form people-form">
          <label>De: <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Até: <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>Vendedor:
            <select value={seller} onChange={(e) => setSeller(e.target.value)}>
              <option value="">Todos</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.nome || p.email}</option>)}
            </select>
          </label>
        </div>
        {msg && <p className="cad-msg">{msg}</p>}
      </div>

      <div className="cad-block">
        <h3>Resumo do período</h3>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div><b>{sales.length}</b><br />vendas</div>
          <div><b>R$ {total.toFixed(2)}</b><br />faturamento</div>
          <div><b>R$ {avg.toFixed(2)}</b><br />ticket médio</div>
        </div>
      </div>

      <div className="cad-block">
        <h3>Vendas registradas</h3>
        <table className="cad-table">
          <thead><tr><th>Código</th><th>Data</th><th>Vendedor</th><th>Cliente</th><th>Pagamento</th><th>Total</th></tr></thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id}>
                <td data-label="Código">{s.code || '#' + s.id}</td>
                <td data-label="Data">{new Date(s.created_at).toLocaleString('pt-BR')}</td>
                <td data-label="Vendedor">{sellerName(s.user_id)}</td>
                <td data-label="Cliente">{customerName(s.customer_id)}</td>
                <td data-label="Pagamento">{s.payment_method || '—'}</td>
                <td data-label="Total">R$ {Number(s.total_amount || 0).toFixed(2)}</td>
              </tr>
            ))}
            {!sales.length && <tr><td colSpan={6}>Nenhuma venda no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
