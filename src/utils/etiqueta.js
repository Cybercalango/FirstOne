// =====================================================================
// Módulo de impressão de etiquetas 30mm x 14mm (metade do comprimento
// da pré-visualização antiga de 60mm — padrão atual da empresa)
// ---------------------------------------------------------------------
// Layout por coluna:
//   [ código interno 8 dígitos ]      [ QR Code curto ]
//   [ código de barras Code128  ]     [ preço           ]
//   [ "R$<preço sem separadores>" sob o barcode, como continuação
//     do código do item — ex.: código 00012345 e preço R$129,90
//     aparecem juntos como "0001234512990" ]
// Obs.: o NOME DA PEÇA não é impresso na etiqueta (decisão do negócio);
//       ele continua disponível na tela para busca/seleção.
//
// Recursos:
//   * Cópia múltipla: peças cadastradas por QUANTIDADE (sql/27) geram
//     N etiquetas numa única emissão (item.copias > 1).
//   * Pré-visualização em tela (previewDeEtiquetas) antes de imprimir.
//   * Saída para navegador (getEtiquetasHTML, CSS exato em mm) e
//     saída ZPL nativa (gerarZpl) para impressoras térmicas Zebra-style
//     (203 dpi = 8 dots/mm): density 12, speed 4, sem conversão de imagem.
//   * Resolução de aliases: códigos legados base-NN encontram o item
//     consolidado via items_barcode_aliases (função lookup_item_por_codigo).
// =====================================================================
import bwipjs from 'bwip-js';
import { supabase } from '../supabaseClient';

export const ETIQUETA = { largura_mm: 30, altura_mm: 14 };
export const DPI_PADRAO = 203; // impressoras térmicas de etiquetas: 8 dots/mm
export const MAX_COPIAS = 999; // limite de cópias por peça / por lote

/** Preço formatado em reais, sem espaço (ex.: R$129,90). */
export function formatarPreco(v) {
  const n = Number(v || 0);
  return 'R$' + n.toFixed(2).replace('.', ',');
}

/**
 * Preço "contínuo": apenas dígitos, sem vírgula/ponto/espaço — ex.:
 * 129.90 -> "12990". Usado na etiqueta como continuação do código do item.
 */
export function precoContinuo(v) {
  return String(Math.round(Number(v || 0) * 100));
}

/** Concatena código + preço contínuo (ex.: 00012345 + 12990 = "0001234512990"). */
export function codigoMaisPreco(codigo, preco) {
  return `${String(codigo)}${precoContinuo(preco)}`;
}

/** Monta o texto curto do QR (código + preço) para leitura rápida. */
export function qrTexto(codigo, preco) {
  return `${codigo}|${Number(preco || 0).toFixed(2)}`;
}

/** Desenha o código de barras Code128 (com texto legível embutido). */
export function desenharBarcode(canvas, codigo) {
  bwipjs.toCanvas(canvas, {
    bcid: 'code128',
    text: String(codigo),
    scale: 2,
    height: 8,
    includetext: true,
    textxalign: 'center',
    textsize: 7,
  });
}

/**
 * Desenha o QR Code no canvas.
 * Atenção: no bwip-js (>= v4) o nome do símbolo é 'qrcode' — 'qr' não
 * existe no registro de encoders e derruba a renderização com
 * "bwipp.unknownEncoder: unknown encoder name: qr". Mantida tolerância
 * extra: se por qualquer motivo o QR falhar, a etiqueta ainda é gerada
 * (campo qrDataUrl fica vazio) em vez de abortar pré-visualização/impressão.
 */
export function desenharQR(canvas, texto) {
  try {
    bwipjs.toCanvas(canvas, {
      bcid: 'qrcode',
      text: texto,
      scale: 3,
      // tamanho pequeno proposital: cabe em ~10mm de altura útil
      includetext: false,
    });
    return true;
  } catch (e) {
    console.error('Falha ao desenhar QR:', e);
    return false;
  }
}

/** Limita o nº de cópias ao intervalo seguro [1, MAX_COPIAS]. */
export function normalizarCopias(v) {
  return Math.max(1, Math.min(MAX_COPIAS, Math.floor(Number(v)) || 1));
}

/** Converte um item em "linha de etiqueta" (com nº de cópias). */
export function linhaDeItem(it) {
  return {
    itemId: it.id,
    codigo: String(it.barcode || '').trim() || String(it.id),
    nome: it.name || it.description || '',
    preco: Number(it.price_sale || 0),
    // prioridade: override escolhido na tela > quantidade informada p/ o
    // lote ("quantas imprimir") > saldo em estoque (quantity) > 1
    copias: normalizarCopias(it.copias ?? it.quantidade ?? it.quantity ?? 1),
  };
}

/**
 * Expande a seleção em lista final de etiquetas: cada item entra com a
 * quantidade de cópias escolhida (peças por estoque -> várias etiquetas
 * na mesma emissão).
 * opts.copiasPorItem: número fixo de cópias para TODOS os itens
 *   (ex.: imprimir 5 etiquetas de cada peça selecionada); quando
 *   informado, substitui o nº individual e o padrão do estoque.
 * opts.total: limite total de etiquetas da emissão — as linhas são
 *   truncadas até esse máximo (útil p/ "imprimir exatamente N").
 */
export function expandirCopias(itens, opts = {}) {
  const out = [];
  const porItem = opts.copiasPorItem != null ? normalizarCopias(opts.copiasPorItem) : null;
  const maxTotal = opts.total != null ? Math.max(0, Math.floor(Number(opts.total)) || 0) : Infinity;
  for (const it of itens) {
    if (out.length >= maxTotal) break;
    // aceita tanto itens crus do banco (sem "codigo") quanto linhas já convertidas
    const linha = (typeof it.copias === 'number' && typeof it.codigo === 'string') ? it : linhaDeItem(it);
    const n = porItem != null ? porItem : linha.copias;
    for (let c = 0; c < n && out.length < maxTotal; c++) out.push({ ...linha, copias: n });
  }
  return out;
}

/**
 * Renderiza todas as etiquetas em canvases e devolve a lista com as
 * imagens em dataURL (usado pelo HTML de impressão e pela pré-visualização).
 * linhas: [{ codigo, preco, ... }] (já expandidas por cópias).
 */
export async function renderizarEtiquetas(linhas, barCanvas, qrCanvas) {
  const out = [];
  for (const it of linhas) {
    desenharBarcode(barCanvas, it.codigo);
    const qrOk = desenharQR(qrCanvas, qrTexto(it.codigo, it.preco));
    out.push({
      ...it,
      barcodeDataUrl: barCanvas.toDataURL('image/png'),
      // se o QR falhou, não reaproveitar desenho anterior do canvas
      qrDataUrl: qrOk ? qrCanvas.toDataURL('image/png') : '',
    });
  }
  return out;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Gera o documento HTML de impressão (uma etiqueta por página 30x14mm).
 * imgs: resultado de renderizarEtiquetas (com barcodeDataUrl/qrDataUrl).
 * opts.autoPrint: abre o diálogo de impressão automaticamente.
 * Layout atual (sem nome da peça): código interno, barcode e preço contínuo
 * "codigopreço" como bloco único sob a imagem do Code128; QR + preço à direita.
 */
export function getEtiquetasHTML(imgs, opts = {}) {
  const { autoPrint = true } = opts;
  const etiquetas = imgs.map((it) => `
    <div class="etiqueta">
      <div class="col-esq">
        <div class="cod">${esc(it.codigo)}</div>
        <img class="bar" src="${it.barcodeDataUrl}" alt="${esc(it.codigo)}" />
        <div class="continua">${esc(codigoMaisPreco(it.codigo, it.preco))}</div>
      </div>
      <div class="col-dir">
        <img class="qr" src="${it.qrDataUrl}" alt="QR" />
        <div class="preco">${formatarPreco(it.preco)}</div>
      </div>
    </div>`).join('\n');

  return `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8"/>
<title>Etiquetas - ${imgs.length} unidade(s)</title>
<style>
  @page { size: ${ETIQUETA.largura_mm}mm ${ETIQUETA.altura_mm}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial Narrow', Arial, sans-serif; background:#fff; }
  .etiqueta {
    width: ${ETIQUETA.largura_mm}mm; height: ${ETIQUETA.altura_mm}mm;
    display: flex; overflow: hidden; page-break-after: always;
    break-after: page; position: relative;
  }
  .col-esq { flex: 1; display:flex; flex-direction:column; justify-content:center; padding-left:.8mm; min-width:0; }
  .cod { font-size: 2.2mm; font-weight: bold; letter-spacing: .15mm; line-height: 2.4mm; }
  .bar { width: 100%; height: 6mm; object-fit: contain; image-rendering: pixelated; }
  /* preço SEM vírgula/ponto, colado ao código do item (continuidade) */
  .continua { font-size: 1.9mm; font-weight: bold; letter-spacing: .1mm; line-height: 2.1mm; white-space: nowrap; }
  .col-dir { width: 9mm; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .qr { width: 5mm; height: 5mm; image-rendering: pixelated; }
  .preco { font-size: 1.8mm; font-weight: bold; line-height: 2.2mm; }
</style></head>
<body>${etiquetas}
${autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print()},250)};</script>' : ''}
</body></html>`;
}

/**
 * Pré-visualização em tela: mesmo layout da impressão (30x14mm), mas dentro
 * de um container do app (não dispara window.print). Retorna HTML pronto para
 * ser injetado via dangerouslySetInnerHTML ou colado num preview.
 * Sem nome da peça; preço contínuo ("código+preço") abaixo do barcode.
 */
export function previewDeEtiquetas(imgs) {
  const etiquetas = imgs.map((it, idx) => `
    <div class="pv-etiqueta" title="Etiqueta ${idx + 1}">
      <div class="pv-col-esq">
        <div class="pv-cod">${esc(it.codigo)}</div>
        <img class="pv-bar" src="${it.barcodeDataUrl}" alt="" />
        <div class="pv-continua">${esc(codigoMaisPreco(it.codigo, it.preco))}</div>
      </div>
      <div class="pv-col-dir">
        <img class="pv-qr" src="${it.qrDataUrl}" alt="" />
        <div class="pv-preco">${formatarPreco(it.preco)}</div>
      </div>
    </div>`).join('\n');
  // escala ~8px/mm -> 30x14mm = 240x112px? Não: mantemos proporção exata da
  // etiqueta física (metade do comprimento anterior): 120x56px (mesma área útil
  // das linhas antigas de 240px cortadas pela metade).
  return `<style>
    .pv-wrap{display:flex;flex-wrap:wrap;gap:6px;padding:6px;background:#eee;border-radius:8px;}
    .pv-etiqueta{width:120px;height:56px;display:flex;overflow:hidden;background:#fff;border:1px dashed #999;box-sizing:border-box;font-family:Arial,sans-serif;}
    .pv-col-esq{flex:1;display:flex;flex-direction:column;justify-content:center;padding-left:2px;min-width:0;}
    .pv-cod{font-size:7px;font-weight:bold;letter-spacing:.5px;line-height:8px;}
    .pv-bar{width:100%;height:20px;object-fit:contain;image-rendering:pixelated;}
    .pv-continua{font-size:6px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .pv-col-dir{width:26px;display:flex;flex-direction:column;align-items:center;justify-content:center;}
    .pv-qr{width:13px;height:13px;image-rendering:pixelated;}
    .pv-preco{font-size:6px;font-weight:bold;}
  </style><div class="pv-wrap">${etiquetas}</div>`;
}

// ---------------------------------------------------------------------
// ZPL nativo (impressoras térmicas Zebra-style, 203 dpi = 8 dots/mm)
// ---------------------------------------------------------------------

/** Escapa texto para campos ^FD do ZPL. */
function zplTexto(s) {
  return String(s).replace(/[\^~\\]/g, ' ');
}

/**
 * Monta o comando ZPL para uma folha de etiquetas 30x14mm.
 * Configuração padrão do painel citada no projeto: density 12, speed 4.
 * linhas: [{ codigo, preco }] (já expandidas por cópias).
 * Sem nome da peça; preço SEM separadores colado ao código ("continuidade").
 */
export function gerarZpl(linhas, opts = {}) {
  const dpi = opts.dpi || DPI_PADRAO;
  const dpmm = dpi / 25.4;                    // 8 dots/mm em 203dpi
  const W = Math.round(ETIQUETA.largura_mm * dpmm); // 240 dots
  const H = Math.round(ETIQUETA.altura_mm * dpmm);  // 112 dots
  const density = opts.density ?? 12;
  const speed = opts.speed ?? 4;
  const codX = 6, codY = 4;
  const dirW = Math.round(9 * dpmm);          // 72 dots p/ QR+preço
  const barH = Math.round(5 * dpmm);          // 40 dots
  const qrSize = Math.round(5 * dpmm);        // 40 dots
  const dirX = W - dirW;

  const blocos = linhas.map((it) => `
^FO${codX},${codY}^A0N,${Math.round(2.2 * dpmm)},${Math.round(2.2 * dpmm)}^FD${zplTexto(it.codigo)}^FS
^FO${codX},${codY + Math.round(2.6 * dpmm)}^BY2,3,${barH}^BCN,${barH},N,N,N^FD${zplTexto(it.codigo)}^FS
^FO${codX},${codY + Math.round(9.4 * dpmm)}^A0N,${Math.round(1.9 * dpmm)},${Math.round(1.9 * dpmm)}^FD${zplTexto(codigoMaisPreco(it.codigo, it.preco))}^FS
^FO${dirX + Math.round((dirW - qrSize) / 2)},${codY}^BQN,2,3^FDLA,${zplTexto(qrTexto(it.codigo, it.preco))}^FS
^FO${dirX},${H - Math.round(2.6 * dpmm)}^A0N,${Math.round(1.8 * dpmm)},${Math.round(1.8 * dpmm)}^FD${zplTexto(formatarPreco(it.preco))}^FS`).join('\n');

  return `^XA
^CI28
^MD0
^MNY
^PW${W}
^LL${H}
^MNW
^JMA
^SD${density}
^SV${speed}
^LT0
^LH0,0
${blocos}
^XZ
`;
}

/** Envia o ZPL direto para uma porta USB/rede (se o browser permitir fetch local). */
export async function enviarZpl(zpl, endpoint) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: zpl,
    mode: 'cors',
  });
  if (!res.ok) throw new Error(`Impressora respondeu ${res.status}`);
  return true;
}

/** Baixa o ZPL como arquivo .zpl (para soltar na fila da impressora). */
export function baixarZpl(zpl, nomeArquivo = 'etiquetas.zpl') {
  const blob = new Blob([zpl], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------------
// Registro histórico de emissões + resolução de aliases (sql/27)
// ---------------------------------------------------------------------

/**
 * Registra a emissão em label_prints + label_print_items (sql/28).
 * Retorna o id do lote (ou null se a tabela ainda não existir no banco —
 * nesse caso a impressão continua funcionando normalmente).
 */
export async function registrarImpressao(linhas) {
  try {
    const { data: sess } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('label_prints').insert({
      total_labels: linhas.length,
      printed_by: sess?.user?.id || null,
    }).select('id').single();
    if (error || !data) return null;
    const printId = data.id;
    // agrega cópias por item para o histórico detalhado
    const porItem = {};
    for (const l of linhas) {
      if (l.itemId == null) continue;
      porItem[l.itemId] = (porItem[l.itemId] || 0) + 1;
    }
    const rows = Object.entries(porItem).map(([item_id, copies]) => ({
      print_id: printId, item_id: Number(item_id), copies,
    }));
    if (rows.length) await supabase.from('label_print_items').insert(rows);
    return printId;
  } catch { return null; }
}

/**
 * Resolve um código lido (novo ou legado base-NN) para o item correspondente:
 * 1º procura items.barcode exato; 2º consulta items_barcode_aliases (labels
 * antigas continuam válidas após a consolidação do sql/27).
 */
export async function resolverItemPorCodigo(codigo) {
  const limpo = String(codigo).replace(/[\s-]/g, '');
  let { data } = await supabase.from('items').select('*').eq('barcode', limpo).maybeSingle();
  if (data) return data;
  const { data: alias } = await supabase
    .from('items_barcode_aliases').select('item_id').eq('barcode', limpo).maybeSingle();
  if (alias) {
    const { data: item } = await supabase.from('items').select('*').eq('id', alias.item_id).maybeSingle();
    if (item) return item;
  }
  return null;
}
