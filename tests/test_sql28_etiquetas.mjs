// Testa sql/28_etiquetas.sql num PGlite simulando o Supabase:
//  - cria label_prints / label_print_items (idempotente: roda 2x)
//  - lookup_item_por_codigo resolve: barcode exato > alias legado base-NN
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let mig = readFileSync(join(root, 'sql', '28_etiquetas.sql'), 'utf8')
  // auth.users e RLS não existem no PGlite puro — adapta só o ambiente de teste
  .replace(/,\s*printed_by\s+UUID REFERENCES auth\.users\(id\) ON DELETE SET NULL/, '')
  .replace(/ALTER TABLE public\.\w+\s+ENABLE ROW LEVEL SECURITY;/g, '')
  .replace(/DROP POLICY[^;]+;/g, '').replace(/CREATE POLICY[\s\S]+?;/g, '');

let failures = 0;
async function check(label, fn) {
  try { await fn(); console.log(`PASS | ${label}`); }
  catch (e) { failures++; console.log(`FAIL | ${label} -> ${String(e.message).split('\n')[0]}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const db = new PGlite();
await db.exec(`
CREATE TABLE items(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, barcode TEXT UNIQUE, name TEXT, quantity INT DEFAULT 1);
INSERT INTO items(barcode,name,quantity) VALUES ('12345678','Anel consolidado',4);
INSERT INTO items(barcode,name,quantity) VALUES ('anelbase-01','Anel legado 01',1);
`);

console.log('--- Aplicando sql/28 (1ª vez) ---');
await db.exec(mig);
console.log('--- Aplicando sql/28 (2ª vez, idempotência) ---');
await db.exec(mig);

await check('tabelas de impressão criadas', async () => {
  const t = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'label_print%' ORDER BY 1`);
  assert(t.rows.length === 2 && t.rows[0].table_name === 'label_print_items' && t.rows[1].table_name === 'label_prints', JSON.stringify(t.rows));
});

await check('histórico de emissão grava lote + itens', async () => {
  await db.exec(`INSERT INTO label_prints(total_labels) VALUES (6);
                 INSERT INTO label_print_items(print_id,item_id,copies) VALUES (1,1,4),(1,2,2);`);
  const r = await db.query(`SELECT p.total_labels, sum(l.copies)::int AS copias FROM label_prints p JOIN label_print_items l ON l.print_id=p.id GROUP BY 1`);
  assert(r.rows[0].total_labels === 6 && r.rows[0].copias === 6, JSON.stringify(r.rows));
});

await check('lookup_item_por_codigo: barcode exato vence', async () => {
  const r = await db.query(`SELECT * FROM lookup_item_por_codigo('12345678')`);
  assert(r.rows.length === 1 && Number(r.rows[0].item_id) === 1 && r.rows[0].resolved_via === 'items.barcode', JSON.stringify(r.rows));
});

await check('lookup_item_por_codigo: código legado via alias aponta p/ item consolidado', async () => {
  await db.exec(`INSERT INTO items_barcode_aliases(barcode,item_id) VALUES ('anelbase-02',1);`);
  const r = await db.query(`SELECT * FROM lookup_item_por_codigo('anelbase-02')`);
  assert(r.rows.length === 1 && Number(r.rows[0].item_id) === 1 && r.rows[0].resolved_via === 'alias', JSON.stringify(r.rows));
});

await check('lookup_item_por_codigo: código inexistente devolve vazio', async () => {
  const r = await db.query(`SELECT * FROM lookup_item_por_codigo('99999999')`);
  assert(r.rows.length === 0, JSON.stringify(r.rows));
});

console.log(failures ? `\n${failures} teste(s) falharam` : '\nTodos os testes passaram');
process.exit(failures ? 1 : 0);
