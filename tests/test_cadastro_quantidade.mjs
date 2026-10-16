// Teste: cadastro de itens com quantidade (migração 23)
// Simula o fluxo do Produtos.jsx: insere N peças + N movimentações
// ('entrada', reason 'cadastro') e verifica gatilhos/status/histórico.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mig21 = readFileSync(join(root, 'sql', '21_fix_items_name_not_null.sql'), 'utf8');
const mig22 = readFileSync(join(root, 'sql', '22_fix_stock_movements_columns.sql'), 'utf8');
const mig23 = readFileSync(join(root, 'sql', '23_estoque_quantidade_no_cadastro.sql'), 'utf8');

let failures = 0;
async function check(label, fn) {
  try { await fn(); console.log(`PASS | ${label}`); }
  catch (e) { failures++; console.log(`FAIL | ${label} -> ${String(e.message).split('\n')[0]}`); }
}

const db = new PGlite();

// Schema base (como 09_setup_completo) + legado products->items (como 10)
await db.exec(`
CREATE TABLE variants(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE types(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE size_grids(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE grid_sizes(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, grid_id INT NOT NULL, size TEXT NOT NULL);
CREATE TABLE people(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE models(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE item_status_history(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, item_id INT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, reason TEXT DEFAULT '', user_id UUID, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE products(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL);
ALTER TABLE public.products RENAME TO items;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS barcode TEXT UNIQUE;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS model_id BIGINT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS variant_id BIGINT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS price_cost NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS price_sale NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'estoque';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS owner_type TEXT NOT NULL DEFAULT 'loja';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS owner_id BIGINT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS acquisition_date DATE;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
-- stock_movements no formato LEGADO (movement_type, sem quantity/type), como saiu do 09
CREATE TABLE stock_movements(
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id INT NOT NULL, person_id INT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada','saida')),
  reason TEXT NOT NULL DEFAULT 'outro'
    CHECK (reason IN ('compra','producao','ajuste','venda','consignacao',
                      'devolucao_consignacao','quebra','perda','transferencia','outro')),
  reference TEXT DEFAULT '', notes TEXT DEFAULT '',
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO models(name) VALUES ('Anel Solitário');
INSERT INTO variants(name) VALUES ('Prata');
`);

console.log('--- Aplicando migrações 21, 22 e 23 ---');
await check('migração 21 roda', () => db.exec(mig21));
await check('migração 22 roda', () => db.exec(mig22));
await check('migração 23 roda', () => db.exec(mig23));
await check('migração 23 é idempotente (roda 2x)', () => db.exec(mig23));

console.log('\n--- Fluxo do app: cadastrar QTD=3 peças + entradas de estoque ---');
const qty = 3, baseCode = '12345678';
await check('INSERT em lote das 3 peças (como o app faz)', async () => {
  const rows = [];
  for (let k = 0; k < qty; k++) {
    rows.push(`(1, 'Anel Solitário Prata', '${baseCode}-${String(k+1).padStart(2,'0')}', 1, NULL, 0, 0, 'estoque', 'loja')`);
  }
  await db.exec(`INSERT INTO items (model_id, name, barcode, variant_id, size, price_cost, price_sale, status, owner_type) VALUES ${rows.join(',')};`);
});
await check('reason "cadastro" é aceito agora', async () => {
  await db.exec(`INSERT INTO stock_movements (item_id, type, quantity, reason, notes)
                 SELECT id, 'entrada', 1, 'cadastro', 'Cadastro inicial (3 pçs)' FROM items ORDER BY id;`);
});
await check('antes da 23, reason "cadastro" seria rejeitado', async () => {
  // constraint antiga não permitia — validamos que a nova lista contém cadastro
  const r = await db.query(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname='stock_movements_reason_check'`);
  if (!/cadastro/.test(r.rows[0].d)) throw new Error('constraint não inclui cadastro');
});
await check('3 peças criadas, todas em estoque', async () => {
  const r = await db.query(`SELECT count(*)::int n FROM items WHERE status='estoque'`);
  if (r.rows[0].n !== 3) throw new Error(`esperava 3, obtive ${r.rows[0].n}`);
});
await check('3 movimentações de entrada registradas', async () => {
  const r = await db.query(`SELECT count(*)::int n FROM stock_movements WHERE type='entrada' AND reason='cadastro'`);
  if (r.rows[0].n !== 3) throw new Error(`esperava 3, obtive ${r.rows[0].n}`);
});
await check('trigger NÃO sobrescreve status na entrada de cadastro', async () => {
  const r = await db.query(`SELECT DISTINCT status FROM items`);
  if (r.rows.length !== 1 || r.rows[0].status !== 'estoque') throw new Error('status alterado');
});
await check('histórico de status preenchido pelas entradas', async () => {
  const r = await db.query(`SELECT count(*)::int n FROM item_status_history WHERE reason='cadastro'`);
  if (r.rows[0].n !== 3) throw new Error(`esperava 3 linhas, obtive ${r.rows[0].n}`);
});
let idPeca1;
await check('saída ainda funciona (empresta a 1ª peça cadastrada)', async () => {
  const ids = await db.query(`SELECT id FROM items ORDER BY id LIMIT 1`);
  idPeca1 = ids.rows[0].id;
  await db.exec(`INSERT INTO stock_movements (item_id, type, quantity, reason) VALUES (${idPeca1}, 'saida', 1, 'outro');`);
  const r = await db.query(`SELECT status FROM items WHERE id=${idPeca1}`);
  if (r.rows[0].status !== 'emprestado') throw new Error('saída não mudou status para emprestado');
});
await check('entrada (devolução) devolve ao estoque', async () => {
  await db.exec(`INSERT INTO stock_movements (item_id, type, quantity, reason) VALUES (${idPeca1}, 'entrada', 1, 'devolucao_consignacao');`);
  const r = await db.query(`SELECT status FROM items WHERE id=${idPeca1}`);
  if (r.rows[0].status !== 'estoque') throw new Error('devolução não restaurou estoque');
});
await check('quantity 0 é normalizada para 1 pelo gate da trigger', async () => {
  await db.exec(`INSERT INTO stock_movements (item_id, type, quantity, reason) VALUES (${idPeca1}, 'entrada', 0, 'cadastro');`);
  const r = await db.query(`SELECT quantity FROM stock_movements ORDER BY id DESC LIMIT 1`);
  if (Number(r.rows[0].quantity) !== 1) throw new Error(`esperava 1, obtive ${r.rows[0].quantity}`);
});
await check('movimento sem quantity usa default 1', async () => {
  await db.exec(`INSERT INTO stock_movements (item_id, type, reason) VALUES (${idPeca1}, 'entrada', 'cadastro');`);
  const r = await db.query(`SELECT quantity FROM stock_movements ORDER BY id DESC LIMIT 1`);
  if (Number(r.rows[0].quantity) !== 1) throw new Error(`esperava 1, obtive ${r.rows[0].quantity}`);
});

process.exit(failures ? 1 : 0);
