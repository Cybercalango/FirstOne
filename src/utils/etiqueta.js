// =====================================================================
// Geração de etiquetas 60mm x 14mm (padrão da empresa)
// ---------------------------------------------------------------------
// Layout por coluna:
//   [ código interno 8 dígitos ]      [ QR Code curto ]
//   [ código de barras Code128  ]     [ preço           ]
// Impressão: botão Imprimir -> janela do navegador com CSS exato em mm.
// O painel da sua impressora térmica (EPL2/ZPL2/PPLA, densidade 12,
// temperatura 12, velocidade 4) recebe a página como imagem/documento;
// as medidas abaixo já respeitam 6,00cm x 1,40cm por etiqueta.
// =====================================================================
import bwipjs from 'bwip-js';

export const ETIQUETA = { largura_mm: 60, altura_mm: 14 };

/** Preço formatado em reais, sem espaço (ex.: R$129,90). */
export function formatarPreco(v) {
  const n = Number(v || 0);
  return 'R$' + n.toFixed(2).replace('.', ',');
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

/** Desenha o QR Code no canvas. */
export function desenharQR(canvas, texto) {
  bwipjs.toCanvas(canvas, {
    bcid: 'qr',
    text: texto,
    scale: 3,
    // tamanho pequeno proposital: cabe em ~10mm de altura útil
    includetext: false,
  });
}

/**
 * Gera o HTML de uma etiqueta individual (60x14mm).
 * Os canvases são convertidos para PNG antes (via toDataURL) — faça isso
 * chamando getEtiquetasHTML depois de renderizar os canvases ocultos.
 */
export function getEtiquetasHTML(itens) {
  // itens: [{ codigo, preco, barcodeDataUrl, qrDataUrl }]
  const etiquetas = itens.map((it) => `
    <div class="etiqueta">
      <div class="col-esq">
        <div class="cod">${it.codigo}</div>
        <img class="bar" src="${it.barcodeDataUrl}" alt="${it.codigo}" />
      </div>
      <div class="col-dir">
        <img class="qr" src="${it.qrDataUrl}" alt="QR" />
        <div class="preco">${formatarPreco(it.preco)}</div>
      </div>
    </div>`).join('\n');

  return `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8"/>
<title>Etiquetas - ${itens.length} peça(s)</title>
<style>
  @page { size: ${ETIQUETA.largura_mm}mm ${ETIQUETA.altura_mm}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial Narrow', Arial, sans-serif; background:#fff; }
  .etiqueta {
    width: ${ETIQUETA.largura_mm}mm; height: ${ETIQUETA.altura_mm}mm;
    display: flex; overflow: hidden; page-break-after: always;
    break-after: page; position: relative;
  }
  .col-esq { flex: 1; display:flex; flex-direction:column; justify-content:center; padding-left:1mm; }
  .cod { font-size: 2.6mm; font-weight: bold; letter-spacing: .3mm; line-height: 3mm; }
  .bar { width: 100%; height: 7mm; object-fit: contain; image-rendering: pixelated; }
  .col-dir { width: 13mm; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .qr { width: 7mm; height: 7mm; image-rendering: pixelated; }
  .preco { font-size: 2.4mm; font-weight: bold; line-height: 3mm; }
</style></head>
<body>${etiquetas}
<script>window.onload=function(){setTimeout(function(){window.print()},250)};</script>
</body></html>`;
}
