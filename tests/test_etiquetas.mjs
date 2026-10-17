// Testa o módulo de impressão de etiquetas (src/utils/etiqueta.js) em Node:
//  - expandirCopias: peça com estoque N vira N etiquetas; override respeitado
//  - getEtiquetasHTML: @page 30x14mm, uma etiqueta por página, escape de HTML
//  - gerarZpl: dimensões em dots (203dpi), ^XA/^XZ, SD12/SV4, QR e Code128
//  - previewDeEtiquetas: renderiza todas as linhas
//  - layout atual: sem nome da peça; preço SEM separadores como continuação
//    do código ("codigoMaisPreco")
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
async function check(label, fn) {
  try { await fn(); console.log(`PASS | ${label}`); }
  catch (e) { failures++; console.log(`FAIL | ${label} -> ${String(e.message).split('\n')[0]}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// Carrega o módulo sem tocar em supabase/bwip-js: stub dos imports.
const src = readFileSync(join(root, 'src', 'utils', 'etiqueta.js'), 'utf8')
  .replace(/^import bwipjs.*$/m, 'const bwipjs = { toCanvas: () => {} }; export { bwipjs };')
  .replace(/^import \{ supabase \}.*$/m, 'const supabase = {};');
const modUrl = 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
const E = await import(modUrl);

await check('linhaDeItem usa quantity como cópias padrão', async () => {
  const l = E.linhaDeItem({ id: 7, barcode: '12345678', name: 'Anel', price_sale: 99.9, quantity: 5 });
  assert(l.copias === 5 && l.codigo === '12345678' && l.itemId === 7, JSON.stringify(l));
});

await check('override de copias > quantity é respeitado e limitado a 999', async () => {
  assert(E.linhaDeItem({ id: 1, barcode: '1', quantity: 2, copias: 10 }).copias === 10, 'override');
  assert(E.linhaDeItem({ id: 1, barcode: '1', copias: 5000 }).copias === 999, 'limite');
  assert(E.linhaDeItem({ id: 1, barcode: '1', copias: 0 }).copias === 1, 'minimo 1');
});

await check('expandirCopias gera N etiquetas por peça', async () => {
  const linhas = E.expandirCopias([
    { itemId: 1, codigo: 'A', preco: 1, copias: 3 },
    { itemId: 2, codigo: 'B', preco: 2, copias: 1 },
  ]);
  assert(linhas.length === 4, `esperava 4, veio ${linhas.length}`);
  assert(linhas.filter((l) => l.codigo === 'A').length === 3, 'copies A');
});

await check('linhaDeItem usa "quantidade" informada p/ o lote como cópias', async () => {
  const l = E.linhaDeItem({ id: 3, barcode: '99887766', quantity: 2, quantidade: 7 });
  assert(l.copias === 7, `esperava 7 (override do lote), veio ${l.copias}`);
});

await check('normalizarCopias limita a [1, MAX_COPIAS] e ignora lixo', async () => {
  assert(E.MAX_COPIAS === 999, 'constante exportada');
  assert(E.normalizarCopias(5000) === 999, 'teto');
  assert(E.normalizarCopias(0) === 1, 'piso');
  assert(E.normalizarCopias(-3) === 1, 'negativo');
  assert(E.normalizarCopias('abc') === 1, 'nao numerico');
  assert(E.normalizarCopias('12') === 12, 'string numerica');
  assert(E.normalizarCopias(3.7) === 3, 'truncado');
});

await check('expandirCopias: copiasPorItem fixa o nº para todas as peças', async () => {
  const itens = [
    { itemId: 1, codigo: 'A', preco: 1, copias: 3 },
    { itemId: 2, codigo: 'B', preco: 2, copias: 1 },
  ];
  const linhas = E.expandirCopias(itens, { copiasPorItem: 5 });
  assert(linhas.length === 10, `2 pecas x 5 = 10, veio ${linhas.length}`);
  assert(linhas.every((l) => l.copias === 5), 'todas com 5 copias');
});

await check('expandirCopias: total limita a emissão', async () => {
  const itens = [
    { itemId: 1, codigo: 'A', preco: 1, copias: 4 },
    { itemId: 2, codigo: 'B', preco: 2, copias: 4 },
  ];
  assert(E.expandirCopias(itens, { total: 6 }).length === 6, 'truncado em 6');
  assert(E.expandirCopias(itens, { total: 100 }).length === 8, 'sem truncar');
  // combinado: porItem + total
  assert(E.expandirCopias(itens, { copiasPorItem: 3, total: 5 }).length === 5, 'porItem+total');
});

await check('getEtiquetasHTML: página 30x14mm + uma div por etiqueta + escape', async () => {
  const imgs = [
    { codigo: '12345670', nome: '<b>Anel</b>', preco: 129.9, barcodeDataUrl: 'data:x', qrDataUrl: 'data:y' },
    { codigo: '12345671', nome: '', preco: 0, barcodeDataUrl: 'data:x', qrDataUrl: 'data:y' },
  ];
  const html = E.getEtiquetasHTML(imgs);
  assert(html.includes('@page { size: 30mm 14mm; margin: 0; }'), 'medida exata');
  assert((html.match(/class="etiqueta"/g) || []).length === 2, '2 etiquetas');
  // o nome NÃO é impresso na etiqueta; mesmo assim nada de HTML cru vazar
  assert(!html.includes('<b>Anel</b>'), 'escape XSS / nome nao impresso');
  assert(html.includes('window.print()'), 'autoPrint por padrão');
  assert(!E.getEtiquetasHTML(imgs, { autoPrint: false }).includes('window.print()'), 'autoPrint off');
});

// Layout ATUAL (pedido do usuário): a etiqueta contém APENAS o texto
// "código+preço contínuo" e o Code128 abaixo. Sem nome, sem QR, sem preço
// formatado, sem bloco de código separado em cima.
await check('getEtiquetasHTML: só código contínuo + barcode (sem QR/preco/nome)', async () => {
  const imgs = [{ codigo: '00012345', nome: 'Camiseta Batman', preco: 129.9, barcodeDataUrl: 'data:x', qrDataUrl: 'data:y' }];
  const html = E.getEtiquetasHTML(imgs);
  assert(!html.includes('Camiseta Batman'), 'nome nao deve aparecer na etiqueta');
  assert(html.includes('>0001234512990<'), 'codigo+preco continuo como unico texto');
  assert(!html.includes('R$'), 'sem preco formatado');
  assert(!html.includes('class="qr"') && !html.includes('data:y'), 'sem QR na etiqueta');
  assert(!html.includes('>00012345<'), 'sem bloco de codigo separado');
});

await check('previewDeEtiquetas: mesmo layout enxuto (so continuidade + barcode)', async () => {
  const imgs = Array.from({ length: 6 }, (_, i) => ({ codigo: 'c' + i, nome: 'Nome ' + i, preco: i, barcodeDataUrl: 'd', qrDataUrl: 'd' }));
  const pv = E.previewDeEtiquetas(imgs);
  assert((pv.match(/pv-etiqueta/g) || []).length >= 6, '6 previews');
  assert(!pv.includes('Nome 0'), 'preview tambem sem nome');
  assert(pv.includes('c00'), 'continuidade codigo+preco no preview');
  assert(!pv.includes('pv-qr'), 'preview sem QR');
  assert(!pv.includes('R$'), 'preview sem preco formatado');
});

await check('gerarZpl: geometria 203dpi, density/speed do painel, comandos presentes', async () => {
  const zpl = E.gerarZpl([{ codigo: '12345670', preco: 59.9 }]);
  assert(zpl.startsWith('^XA') && zpl.trimEnd().endsWith('^XZ'), 'envelope XA..XZ');
  assert(zpl.includes('^PW240') && zpl.includes('^LL112'), '30x14mm em dots');
  assert(zpl.includes('^SD12') && zpl.includes('^SV4'), 'densidade 12 velocidade 4');
  assert(zpl.includes('^BCN') && zpl.includes('FD12345670'), 'code128 com dados');
  assert(zpl.includes('FD123456705990'), 'codigo+preco continuo no ZPL');
  assert(!zpl.includes('^BQN'), 'QR removido do ZPL');
  assert(!zpl.includes('R$'), 'preco formatado removido do ZPL');
});

await check('precoContinuo/codigoMaisPreco: apenas dígitos, sem virgula ou ponto', async () => {
  assert(E.precoContinuo(129.9) === '12990', `12990 != ${E.precoContinuo(129.9)}`);
  assert(E.precoContinuo(100) === '10000', 'centavos zerados preservados');
  assert(E.precoContinuo(0.5) === '50', 'meio real');
  assert(E.precoContinuo(undefined) === '0', 'vazio -> 0');
  assert(E.codigoMaisPreco('00012345', 129.9) === '0001234512990', 'concatenacao direta');
  assert(!/[,\s]/.test(E.codigoMaisPreco('ABC-1', 7)), 'sem separadores nem espacos');
});

// Sufixo legado "-NN" (ex.: "40670211-01") NAO deve aparecer na etiqueta.
await check('sufixo legado -NN removido do codigo impresso', async () => {
  assert(E.limparSufixoLegado('40670211-01') === '40670211', 'strip -01');
  assert(E.limparSufixoLegado('40670211-15') === '40670211', 'strip -15');
  assert(E.limparSufixoLegado('40670211') === '40670211', 'sem sufixo fica igual');
  assert(E.limparSufixoLegado('40670211-15990') === '40670211-15990', '4+ digitos nao e sufixo');
  assert(E.codigoMaisPreco('40670211-01', 59.9) === '406702115990', 'formato pedido pelo usuario');
  const l = E.linhaDeItem({ id: 9, barcode: '40670211-01', quantity: 6, price_sale: 59.9 });
  assert(l.codigo === '40670211', `linhaDeItem limpa o sufixo, veio ${l.codigo}`);
});

await check('gerarZpl escapa caracteres de controle ^ ~ \\ nos dados', async () => {
  const zpl = E.gerarZpl([{ codigo: '12^3~4\\5', preco: 1 }]);
  assert(!zpl.includes('FD12^3'), 'escape ^');
  assert(zpl.includes('FD12 3 4 5'), 'chars substituídos por espaço');
});

// Regression: bwip-js não possui encoder "qr" — o nome correto é "qrcode".
// Usar "qr" derrubava pré-visualização/impressão com
// "bwipp.unknownEncoder: unknown encoder name: qr".
await check('desenharQR usa bcid "qrcode" (não "qr") e tolera falhas', async () => {
  let opts = null, throwNext = false;
  E.bwipjs.toCanvas = (_c, o) => { if (throwNext) throw new Error('boom'); opts = o; };
  const ok = E.desenharQR({}, '12345678|99.90');
  assert(ok === true, 'deve retornar true quando desenha');
  assert(opts && opts.bcid === 'qrcode', `bcid deve ser qrcode, veio ${opts && opts.bcid}`);
  throwNext = true;
  const fail = E.desenharQR({}, 'x');
  assert(fail === false, 'falha de desenho retorna false sem lançar');
});

console.log(failures ? `\n${failures} teste(s) falharam` : '\nTodos os testes passaram');
process.exit(failures ? 1 : 0);
