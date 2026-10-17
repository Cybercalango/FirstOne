// =====================================================================
// Tela de Etiquetas — Módulo completo de impressão (Blocos 2 + 3)
// ---------------------------------------------------------------------
// - Seleciona peças (filtro por status/modelo ou lista do PDV)
// - Cópia por etiqueta: peças com estoque por quantidade geram N etiquetas
// - Pré-visualização em tela antes de emitir
// - Impressão pelo navegador (30x14mm exato) OU ZPL nativo p/ térmica
// - Registro de emissões em label_prints (sql/28) + histórico na tela
// - Leitura por câmera/USB adiciona à seleção (aceita códigos legados via
//   tabela de aliases do sql/27)
// =====================================================================
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import BackBar from '../components/BackBar';
import LeitorCodigo from '../components/LeitorCodigo';
import {
  desenharBarcode, desenharQR, qrTexto, getEtiquetasHTML, formatarPreco,
  linhaDeItem, expandirCopias, renderizarEtiquetas, previewDeEtiquetas,
  gerarZpl, baixarZpl, enviarZpl, registrarImpressao, resolverItemPorCodigo,
  normalizarCopias, MAX_COPIAS,
} from '../utils/etiqueta';

export default function Etiquetas() {
  const [itens, setItens] = useState([]);
  const [selecionados, setSelecionados] = useState({}); // id -> true
  const [copias, setCopias] = useState({});             // id -> nº de cópias (override)
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('estoque');
  const [msg, setMsg] = useState('');
  const [modo, setModo] = useState('browser');          // browser | zpl | zpl-enviar
  const [qtdModo, setQtdModo] = useState('estoque');    // estoque | porItem | total
  const [qtdValor, setQtdValor] = useState(1);          // nº usado por porItem/total
  const [zplEndpoint, setZplEndpoint] = useState('http://localhost:9100');
  const [preview, setPreview] = useState('');           // html da pré-visualização
  const [previewInfo, setPreviewInfo] = useState(null); // linhas expandidas
  const [historico, setHistorico] = useState([]);
  const barRef = useRef(null);
  const qrRef = useRef(null);

  async function load() {
    let q = supabase.from('items').select('*').order('created_at', { ascending: false }).limit(500);
    if (statusFiltro && statusFiltro !== 'todos') q = q.eq('status', statusFiltro);
    const { data, error } = await q;
    if (error) setMsg('Erro ao carregar peças: ' + error.message);
    else setItens(data || []);
  }
  async function loadHistorico() {
    try {
      const { data } = await supabase.from('label_prints').select('*')
        .order('id', { ascending: false }).limit(10);
      setHistorico(data || []);
    } catch { setHistorico([]); }
  }
  useEffect(() => { load(); }, [statusFiltro]);
  useEffect(() => { loadHistorico(); }, []);

  function toggle(id) {
    setSelecionados((s) => { const n = { ...s }; if (n[id]) delete n[id]; else n[id] = true; return n; });
    setPreview(''); setPreviewInfo(null);
  }
  function mudarCopias(id, v) {
    const n = normalizarCopias(v);
    setCopias((c) => ({ ...c, [id]: n }));
    setPreview(''); setPreviewInfo(null);
  }
  function mudarQtdValor(v) {
    setQtdValor(normalizarCopias(v));
    setPreview(''); setPreviewInfo(null);
  }

  // leitura por câmera/letor USB adiciona à seleção (resolve aliases legados)
  async function aoLer(codigo) {
    const item = itens.find((i) => String(i.barcode).replace(/\D/g, '') === codigo.replace(/\D/g, ''))
      || await resolverItemPorCodigo(codigo).catch(() => null);
    if (!item) { setMsg(`Código ${codigo} não encontrado.`); return; }
    setSelecionados((s) => ({ ...s, [item.id]: true }));
    setMsg(`Peça ${item.barcode || codigo} adicionada à impressão.`);
  }

  const listaFiltrada = itens.filter((i) => {
    if (!busca) return true;
    const b = busca.toLowerCase();
    return (String(i.barcode || '').includes(b)) ||
           (String(i.name || '').toLowerCase().includes(b)) ||
           (String(i.description || '').toLowerCase().includes(b));
  });

  const selIds = Object.keys(selecionados).filter((k) => selecionados[k]);
  const selItens = itens.filter((i) => selIds.includes(String(i.id)))
    .map((i) => linhaDeItem({ ...i, copias: copias[i.id] ?? undefined }));

  // escolha de quantas etiquetas imprimir:
  //  estoque -> cópias por peça (padrão = saldo, editável na tabela)
  //  porItem -> número fixo de etiquetas PARA CADA peça selecionada
  //  total   -> limite total da emissão (distribui entre as peças na ordem)
  function opcoesQtd() {
    if (qtdModo === 'porItem') return { copiasPorItem: qtdValor };
    if (qtdModo === 'total') return { total: qtdValor };
    return {};
  }
  function linhasDoLote() { return expandirCopias(selItens, opcoesQtd()); }
  const totalEtiquetas = linhasDoLote().length;

  async function gerarPreview() {
    if (!selItens.length) { setMsg('Selecione ao menos uma peça.'); return; }
    if (!barRef.current || !qrRef.current) { setMsg('Componentes de desenho indisponíveis.'); return; }
    const linhas = linhasDoLote();
    if (!linhas.length) { setMsg('Nenhuma etiqueta gerada — confira a quantidade escolhida.'); return; }
    const imgs = await renderizarEtiquetas(linhas, barRef.current, qrRef.current);
    setPreview(previewDeEtiquetas(imgs));
    setPreviewInfo(imgs);
    setMsg(`${linhas.length} etiqueta(s) prontas (${selItens.length} peça(s)). Confira e clique em Imprimir.`);
  }

  async function imprimir() {
    if (!previewInfo) { await gerarPreview(); }
    const imgs = previewInfo;
    if (!imgs || !imgs.length) return;
    if (modo === 'zpl') {
      baixarZpl(gerarZpl(imgs));
      setMsg(`ZPL gerado (${imgs.length} etiquetas) — arquivo enviado para download.`);
    } else if (modo === 'zpl-enviar') {
      try {
        await enviarZpl(gerarZpl(imgs), zplEndpoint);
        setMsg(`ZPL enviado para ${zplEndpoint} (${imgs.length} etiquetas).`);
      } catch (e) {
        setMsg('Falha ao enviar direto à impressora: ' + e.message + ' — use "Baixar ZPL".');
      }
    } else {
      const w = window.open('', '_blank');
      if (!w) { setMsg('O navegador bloqueou a janela de impressão. Permita pop-ups.'); return; }
      w.document.write(getEtiquetasHTML(imgs));
      w.document.close();
      setMsg(`${imgs.length} etiqueta(s) enviada(s) para impressão.`);
    }
    await registrarImpressao(imgs);
    loadHistorico();
  }

  function selecionarTodas() {
    const n = {}; listaFiltrada.forEach((i) => { n[i.id] = true; }); setSelecionados(n); setPreview('');
  }
  function limparSelecao() { setSelecionados({}); setCopias({}); setQtdModo('estoque'); setQtdValor(1); setPreview(''); setPreviewInfo(null); }

  return (
    <div className="cad-container">
      <BackBar titulo="🏷️ Etiquetas de Preço" />
      <h2>🏷️ Etiquetas de Preço</h2>
      <p style={{ opacity: .8 }}>Formato 30 x 14 mm · código + Code 128 + QR + preço contínuo (sem vírgula/ponto, junto ao código) · sem nome na etiqueta · cópias por estoque.</p>

      <div className="cad-block">
        <h3>Adicionar por leitura</h3>
        <LeitorCodigo onCodigo={aoLer} />
        {msg && <p className="cad-msg">{msg}</p>}
      </div>

      <div className="cad-block">
        <div className="cad-form people-form" style={{ marginBottom: 8 }}>
          <input placeholder="Buscar código ou nome..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
            <option value="estoque">Em estoque</option>
            <option value="consignacao">Em consignação</option>
            <option value="vendido">Vendidas</option>
            <option value="todos">Todas</option>
          </select>
        </div>
        <table className="cad-table">
          <thead><tr><th></th><th>Código</th><th>Descrição</th><th>Preço</th><th>Estoque</th><th>Cópias</th><th>Status</th></tr></thead>
          <tbody>
            {listaFiltrada.map((i) => (
              <tr key={i.id}>
                <td data-label="Selecionar"><input type="checkbox" checked={!!selecionados[i.id]} onChange={() => toggle(i.id)} /></td>
                <td data-label="Código">{i.barcode}</td>
                <td data-label="Descrição">{i.name || i.description || '—'}</td>
                <td data-label="Preço">{formatarPreco(i.price_sale)}</td>
                <td data-label="Estoque">{i.quantity ?? 1}</td>
                <td data-label="Cópias">
                  <input type="number" min="1" max="999" style={{ width: 64 }}
                    value={copias[i.id] ?? i.quantity ?? 1}
                    onChange={(e) => mudarCopias(i.id, e.target.value)} />
                </td>
                <td data-label="Status">{i.status}</td>
              </tr>
            ))}
            {!listaFiltrada.length && <tr><td colSpan={7}>Nenhuma peça encontrada.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="cad-block">
        <h3>Emissão</h3>
        <div className="cad-form people-form" style={{ marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Quantas etiquetas:
            <select value={qtdModo} onChange={(e) => { setQtdModo(e.target.value); setPreview(''); setPreviewInfo(null); }}>
              <option value="estoque">1 por unidade em estoque (por peça)</option>
              <option value="porItem">Mesma quantidade p/ cada peça</option>
              <option value="total">Total fixo da impressão</option>
            </select>
          </label>
          {qtdModo !== 'estoque' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {qtdModo === 'porItem' ? 'Etiquetas por peça:' : 'Total de etiquetas:'}
              <input type="number" min="1" max={MAX_COPIAS} style={{ width: 90 }}
                value={qtdValor} onChange={(e) => mudarQtdValor(e.target.value)} />
            </label>
          )}
        </div>
        <div className="btn-row" style={{ marginBottom: 8 }}>
          <button onClick={selecionarTodas}>Selecionar visíveis</button>
          <button onClick={limparSelecao}>Limpar seleção</button>
          <button onClick={gerarPreview}>👁️ Pré-visualizar</button>
          <button className="primary" onClick={imprimir}>🖨️ Imprimir ({totalEtiquetas})</button>
        </div>
        <div className="cad-form people-form" style={{ marginBottom: 8 }}>
          <select value={modo} onChange={(e) => setModo(e.target.value)}>
            <option value="browser">Navegador (PDF/impressora do sistema)</option>
            <option value="zpl">Baixar ZPL (impressora térmica)</option>
            <option value="zpl-enviar">Enviar ZPL direto (rede/USB local)</option>
          </select>
          {modo === 'zpl-enviar' && (
            <input placeholder="http://192.168.0.50:9100" value={zplEndpoint}
              onChange={(e) => setZplEndpoint(e.target.value)} />
          )}
        </div>
        {preview && (
          <div style={{ marginTop: 8 }}>
            <strong>Pré-visualização ({previewInfo?.length || 0}):</strong>
            <div dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
        )}
      </div>

      {!!historico.length && (
        <div className="cad-block">
          <h3>Últimas emissões</h3>
          <table className="cad-table">
            <thead><tr><th>#</th><th>Data</th><th>Etiquetas</th></tr></thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.id}>
                  <td data-label="ID">{h.id}</td>
                  <td data-label="Data">{new Date(h.created_at).toLocaleString('pt-BR')}</td>
                  <td data-label="Etiquetas">{h.total_labels}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* canvases ocultos usados só para gerar as imagens */}
      <canvas ref={barRef} style={{ display: 'none' }} />
      <canvas ref={qrRef} style={{ display: 'none' }} />
    </div>
  );
}
