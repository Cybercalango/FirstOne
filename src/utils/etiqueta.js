// =====================================================================
// Módulo de impressão de etiquetas 30mm x 14mm
// ---------------------------------------------------------------------
// Layout MÍNIMO da etiqueta (decisão final do usuário):
//   [ código contínuo ]        ex.: "406702115990"
//   [ código de barras Code128 codificando exatamente esse valor ]
// Nada mais é impresso: sem nome da peça, sem QR code, sem preço
// separado, sem prefixo "R$". O código contínuo = código do item SEM o
// sufixo legado "-NN" + preço apenas em dígitos (centavos), ex.:
//   código "40670211-01", preço 59.90 -> "40670211" + "5990" = "406702115990"
// Obs.: o NOME DA PEÇA continua disponível na tela para busca/seleção.
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

/** Remove o sufixo legado "-NN" de códigos tipo "40670211-01". */
export function limparSufixoLegado(codigo) {
  return String(codigo ?? '').trim().replace(/-\d{1,2}$/, '');
}

/** Concatena código + preço contínuo (ex.: 00012345 + 12990 = "0001234512990"). */
export function codigoMaisPreco(codigo, preco) {
  return `${limparSufixoLegado(codigo)}${precoContinuo(preco)}`;
}

/** Monta o texto curto do QR (código + preço) para leitura rápida. */
export function qrTexto(codigo, preco) {
  return `${codigo}|${Number(preco || 0).toFixed(2)}`;
}

/**
 * Desenha o código de barras Code128 SEM texto embutido — o único texto da
 * etiqueta é o bloco ".cod" (código contínuo) desenhado acima do barcode,
 * então incluir o texto dentro da imagem duplicaria informação.
 */
export function desenharBarcode(canvas, codigo) {
  bwipjs.toCanvas(canvas, {
    bcid: 'code128',
    text: String(codigo),
    scale: 2,
    height: 10,
    includetext: false,
  });
}

/** Limita o nº de cópias ao intervalo seguro [1, MAX_COPIAS]. */
export function normalizarCopias(v) {
  return Math.max(1, Math.min(MAX_COPIAS, Math.floor(Number(v)) || 1));
}

/** Converte um item em "linha de etiqueta" (com nº de cópias). */
export function linhaDeItem(it) {
  return {
    itemId: it.id,
    // código SEM o sufixo legado "-NN" (ex.: "40670211-01" -> "40670211")
    codigo: limparSufixoLegado(String(it.barcode || '').trim()) || String(it.id),
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
 * O parâmetro qrCanvas é aceito por compatibilidade de chamada mas ignorado:
 * a etiqueta mínima atual não contém QR.
 */
export async function renderizarEtiquetas(linhas, barCanvas, _qrCanvas) {
  const out = [];
  for (const it of linhas) {
    desenharBarcode(barCanvas, textoDaEtiqueta(it));
    out.push({ ...it, barcodeDataUrl: barCanvas.toDataURL('image/png') });
  }
  return out;
}

/**
 * Único conteúdo impresso da etiqueta: o código contínuo
 * (código do item sem sufixo -NN + preço só em dígitos), ex.:
 * "40670211" + 59.90 -> "406702115990". Sem nome, sem QR, sem "R$".
 */
export function textoDaEtiqueta(it) {
  return codigoMaisPreco(it.codigo, it.preco);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Gera o documento HTML de impressão (uma etiqueta por página 30x14mm).
 * imgs: resultado de renderizarEtiquetas (com barcodeDataUrl).
 * opts.autoPrint: abre o diálogo de impressão automaticamente.
 * Layout MÍNIMO (decisão do usuário): apenas o texto do código contínuo
 * (ex.: "406702115990") e, abaixo, o código de barras Code128 codificando
 * exatamente esse mesmo valor. Nada mais é impresso (sem nome, sem QR,
 * sem preço separado).
 */
export function getEtiquetasHTML(imgs, opts = {}) {
  const { autoPrint = true } = opts;
  const etiquetas = imgs.map((it) => `
    <div class="etiqueta">
      <div class="cod">${esc(textoDaEtiqueta(it))}</div>
      <img class="bar" src="${it.barcodeDataUrl}" alt="${esc(textoDaEtiqueta(it))}" />
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
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    overflow: hidden; page-break-after: always;
    break-after: page; position: relative;
  }
  /* único texto da etiqueta: código contínuo (código+preço, sem sufixo -NN) */
  .cod { font-size: 2.6mm; font-weight: bold; letter-spacing: .1mm; line-height: 2.8mm; white-space: nowrap; }
  .bar { width: 92%; height: 7.5mm; object-fit: contain; image-rendering: pixelated; margin-top:.5mm; }
</style></head>
<body>${etiquetas}
${autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print()},250)};</script>' : ''}
</body></html>`;
}

/**
 * Pré-visualização em tela: MESMO layout mínimo da impressão (30x14mm),
 * mas dentro de um container do app (não dispara window.print).
 * Apenas o código contínuo + barcode — sem nome, sem QR, sem preço extra.
 */
export function previewDeEtiquetas(imgs) {
  const etiquetas = imgs.map((it, idx) => `
    <div class="pv-etiqueta" title="Etiqueta ${idx + 1}">
      <div class="pv-cod">${esc(textoDaEtiqueta(it))}</div>
      <img class="pv-bar" src="${it.barcodeDataUrl}" alt="" />
    </div>`).join('\n');
  // proporção exata da etiqueta física 30x14mm -> 120x56px
  return `<style>
    .pv-wrap{display:flex;flex-wrap:wrap;gap:6px;padding:6px;background:#eee;border-radius:8px;}
    .pv-etiqueta{width:120px;height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;background:#fff;border:1px dashed #999;box-sizing:border-box;font-family:Arial,sans-serif;}
    .pv-cod{font-size:8px;font-weight:bold;letter-spacing:.3px;line-height:9px;white-space:nowrap;}
    .pv-bar{width:92%;height:26px;object-fit:contain;image-rendering:pixelated;margin-top:2px;}
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
 * Layout MÍNIMO idêntico ao HTML: texto do código contínuo + Code128 que
 * codifica esse mesmo valor. Sem nome, sem QR, sem preço separado.
 */
export function gerarZpl(linhas, opts = {}) {
  const dpi = opts.dpi || DPI_PADRAO;
  const dpmm = dpi / 25.4;                    // 8 dots/mm em 203dpi
  const W = Math.round(ETIQUETA.largura_mm * dpmm); // 240 dots
  const H = Math.round(ETIQUETA.altura_mm * dpmm);  // 112 dots
  const density = opts.density ?? 12;
  const speed = opts.speed ?? 4;
  const codX = 6, codY = 4;
  const barH = Math.round(7.5 * dpmm);        // 60 dots

  const blocos = linhas.map((it) => {
    const txt = zplTexto(textoDaEtiqueta(it));
    return `
^FO${codX},${codY}^A0N,${Math.round(2.6 * dpmm)},${Math.round(2.6 * dpmm)}^FD${txt}^FS
^FO${Math.round(W * 0.04)},${codY + Math.round(3.6 * dpmm)}^BY2,3,${barH}^BCN,${barH},N,N,N^FD${txt}^FS`;
  }).join('\n');

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
