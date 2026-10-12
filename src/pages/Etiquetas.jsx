// =====================================================================
// Tela de Etiquetas — Bloco 2 + 3 (geração e emissão em lote)
// ---------------------------------------------------------------------
// - Seleciona peças (filtro por status/modelo/variacao ou lista do PDV)
// - Gera etiqueta 60x14mm: código 8 dígitos + Code128 + QR + preço
// - Botão Imprimir abre a página exata para a impressora térmica
// =====================================================================
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import BackBar from '../components/BackBar';
import LeitorCodigo from '../components/LeitorCodigo';
import { desenharBarcode, desenharQR, qrTexto, getEtiquetasHTML, formatarPreco } from '../utils/etiqueta';

export default function Etiquetas() {
  const [itens, setItens] = useState([]);
  const [selecionados, setSelecionados] = useState({}); // id -> true
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('estoque');
  const [msg, setMsg] = useState('');
  const barRef = useRef(null);
  const qrRef = useRef(null);

  async function load() {
    let q = supabase.from('items').select('*').order('created_at', { ascending: false }).limit(500);
    if (statusFiltro && statusFiltro !== 'todos') q = q.eq('status', statusFiltro);
    const { data, error } = await q;
    if (error) setMsg('Erro ao carregar peças: ' + error.message);
    else setItens(data || []);
  }
  useEffect(() => { load(); }, [statusFiltro]);

  function toggle(id) {
    setSelecionados((s) => { const n = { ...s }; if (n[id]) delete n[id]; else n[id] = true; return n; });
  }

  // leitura por câmera/letor USB adiciona à seleção
  function aoLer(codigo) {
    const item = itens.find((i) => String(i.barcode).replace(/\D/g, '') === codigo.replace(/\D/g, ''));
    if (!item) { setMsg(`Código ${codigo} não encontrado na lista carregada.`); return; }
    setSelecionados((s) => ({ ...s, [item.id]: true }));
    setMsg(`Peça ${codigo} adicionada à impressão.`);
  }

  const listaFiltrada = itens.filter((i) => {
    if (!busca) return true;
    const b = busca.toLowerCase();
    return (String(i.barcode || '').includes(b)) ||
           (String(i.name || '').toLowerCase().includes(b)) ||
           (String(i.description || '').toLowerCase().includes(b));
  });

  const selIds = Object.keys(selecionados).filter((k) => selecionados[k]);
  const selItens = itens.filter((i) => selIds.includes(String(i.id)));

  async function imprimir() {
    if (!selItens.length) { setMsg('Selecione ao menos uma peça.'); return; }
    if (!barRef.current || !qrRef.current) { setMsg('Componentes de desenho indisponíveis.'); return; }
    const out = [];
    for (const it of selItens) {
      desenharBarcode(barRef.current, it.barcode);
      desenharQR(qrRef.current, qrTexto(it.barcode, it.price_sale));
      out.push({
        codigo: it.barcode,
        preco: it.price_sale,
        barcodeDataUrl: barRef.current.toDataURL('image/png'),
        qrDataUrl: qrRef.current.toDataURL('image/png'),
      });
    }
    const w = window.open('', '_blank');
    if (!w) { setMsg('O navegador bloqueou a janela de impressão. Permita pop-ups.'); return; }
    w.document.write(getEtiquetasHTML(out));
    w.document.close();
    setMsg(`${out.length} etiqueta(s) enviada(s) para impressão.`);
  }

  function selecionarTodas() {
    const n = {}; listaFiltrada.forEach((i) => { n[i.id] = true; }); setSelecionados(n);
  }
  function limparSelecao() { setSelecionados({}); }

  return (
    <div className="page">
      <BackBar titulo="🏷️ Etiquetas de Preço" />
      <p style={{ opacity: .8 }}>Formato {`60 x 14 mm`} · código interno + Code 128 + QR + preço.</p>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3>Adicionar por leitura</h3>
        <LeitorCodigo onCodigo={aoLer} />
        {msg && <p className="msg">{msg}</p>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input placeholder="Buscar código ou nome..." value={busca} onChange={(e) => setBusca(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
            <option value="estoque">Em estoque</option>
            <option value="consignacao">Em consignação</option>
            <option value="vendido">Vendidas</option>
            <option value="todos">Todas</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <button onClick={selecionarTodas}>Selecionar visíveis</button>
          <button onClick={limparSelecao}>Limpar seleção</button>
          <button className="primary" onClick={imprimir}>🖨️ Imprimir ({selIds.length})</button>
        </div>
        <table className="tabela">
          <thead><tr><th></th><th>Código</th><th>Descrição</th><th>Preço</th><th>Status</th></tr></thead>
          <tbody>
            {listaFiltrada.map((i) => (
              <tr key={i.id}>
                <td><input type="checkbox" checked={!!selecionados[i.id]} onChange={() => toggle(i.id)} /></td>
                <td>{i.barcode}</td>
                <td>{i.name || i.description || '—'}</td>
                <td>{formatarPreco(i.price_sale)}</td>
                <td>{i.status}</td>
              </tr>
            ))}
            {!listaFiltrada.length && <tr><td colSpan={5}>Nenhuma peça encontrada.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* canvases ocultos usados só para gerar as imagens */}
      <canvas ref={barRef} style={{ display: 'none' }} />
      <canvas ref={qrRef} style={{ display: 'none' }} />
    </div>
  );
}
