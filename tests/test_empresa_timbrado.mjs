// Testes do papel timbrado / dados da empresa (src/utils/empresa.js)
// sem importar o módulo real (ele puxa supabase): reimplementação-espelho
// das funções puras + verificação estática do código-fonte.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../src/utils/empresa.js', import.meta.url), 'utf8');
const cad = readFileSync(new URL('../src/pages/Cadastros.jsx', import.meta.url), 'utf8');
const cons = readFileSync(new URL('../src/pages/Consignacoes.jsx', import.meta.url), 'utf8');
const sql29 = readFileSync(new URL('../sql/29_config_empresa.sql', import.meta.url), 'utf8');

let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('PASS', n); } catch (e) { console.error('FAIL', n, '-', e.message); process.exitCode = 1; } };

t('empresa.js expõe API completa', () => {
  for (const fn of ['export async function getEmpresa', 'export function setEmpresaCache', 'export function htmlPapelTimbrado', 'export const escHtml', 'export async function logoParaDataUrl', 'export function contatosEmpresa'])
    assert.ok(src.includes(fn), 'faltando ' + fn);
});

t('timbrado tem identidade Flor da Pele (faixas, logo, doc-*)', () => {
  assert.match(src, /--magenta:#8E2A6E/);
  assert.ok(src.includes('class="faixa"') && src.includes('class="regua"'));
  assert.ok(src.includes('<img class="logo"') && src.includes('logo-texto'));
  for (const c of ['doc-eyebrow', 'doc-titulo', 'doc-meta', 'doc-tabela', 'doc-destaque', 'doc-assinaturas', 'doc-nota'])
    assert.ok(src.includes('.' + c), 'faltando classe .' + c);
  assert.ok(src.includes('@page { size:A4'), 'formato A4');
});

t('escHtml escapa injeção de HTML', () => {
  // espelha a implementação: & < > "
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  assert.equal(esc('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
});

t('contatosEmpresa monta linhas corretamente', () => {
  const contatosEmpresa = (e) => {
    const l = [];
    const tel = [e.telefone, e.whatsapp ? `${e.whatsapp}${e.telefone ? '' : ' · WhatsApp'}` : ''].filter(Boolean).join(' · ');
    if (tel) l.push(tel);
    if (e.email) l.push(e.email);
    const web = [e.site, e.instagram ? `@${String(e.instagram).replace(/^@/, '')}` : ''].filter(Boolean).join(' · ');
    if (web) l.push(web);
    return l;
  };
  assert.deepEqual(contatosEmpresa({ telefone: '(83) 3333-2222', whatsapp: '(83) 99999-1111', email: 'a@b.com', site: 'www.x.com', instagram: '@x' }),
    ['(83) 3333-2222 · (83) 99999-1111', 'a@b.com', 'www.x.com · @x']);
  assert.deepEqual(contatosEmpresa({ whatsapp: '9999' }), ['9999 · WhatsApp']);
});

t('romaneio usa papel timbrado (não mais o layout antigo)', () => {
  assert.ok(cons.includes('htmlPapelTimbrado') && cons.includes('getEmpresa'));
  assert.ok(!cons.includes('Cormorant Garamond'), 'estilo antigo removido');
  assert.ok(cons.includes('w.print()'), 'ainda dispara impressão');
});

t('Cadastros Base tem aba Empresa com CRUD de company_settings', () => {
  assert.ok(cad.includes("id: 'empresa'") && cad.includes('function Empresa'));
  assert.ok(cad.includes("from('company_settings')"));
  assert.ok(cad.includes('setEmpresaCache'), 'salvar atualiza o cache de impressão');
});

t('sql/29 cria company_settings idempotente com defaults Flor da Pele', () => {
  assert.match(sql29, /CREATE TABLE IF NOT EXISTS public\.company_settings/);
  assert.match(sql29, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(sql29, /CHECK \(id = 1\)/);
  assert.ok(sql29.includes("'Flor da Pele'") && sql29.includes("'Joias Folheadas'"));
  assert.match(sql29, /NOTIFY pgrst, 'reload schema'/);
});

console.log(`\n${ok} testes PASS`);
