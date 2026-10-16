// Teste da correção: executa o script sql/21_fix_items_name_not_null.sql
// sobre um banco com o bug (items.name NOT NULL herdado da tabela legada
// `products`) e verifica que os INSERTs do app corrigido passam a funcionar.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(join(root, 'sql', '21_fix_items_name_not_null.sql'), 'utf8');

let failures = 0;
async function check(label, fn) {
  try { await fn(); console.log(`PASS | ${label}`); }
  catch (e) { failures++; console.log(`FAIL | ${label} -> ${String(e.message).split('\n')[0]}`); }
}

const db = new PGlite();

// Estado "quebrado": items veio de products (name NOT NULL) + colunas do app.
await db.exec(`
CREATE TABLE models(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE products(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL, price NUMERIC(12,2) DEFAULT 0);
INSERT INTO products(name, price) VALUES ('Colar Legado', 10);
ALTER TABLE public.products RENAME TO items;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS barcode TEXT;
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
INSERT INTO models(name) VALUES ('Anel Solitário');
`);

console.log('--- Antes da correção: INSERT antigo do app deve falhar ---');
await check('INSERT sem name falha com o erro reportado', async () => {
  let falhou = false;
  try {
    await db.exec(`INSERT INTO items (model_id, barcode, status, owner_type) VALUES (1, '12345678', 'estoque', 'loja');`);
  } catch (e) {
    falhou = /null value in column "name".*not-null constraint/.test(e.message);
  }
  if (!falhou) throw new Error('esperava violação de not-null em items.name');
});

console.log('\n--- Aplicando sql/21_fix_items_name_not_null.sql ---');
await check('migração roda sem erros', () => db.exec(migration));
await check('migração é idempotente (roda 2x)', () => db.exec(migration));
await check('coluna name agora é nullable', async () => {
  const r = await db.query(`SELECT is_nullable FROM information_schema.columns WHERE table_name='items' AND column_name='name'`);
  if (r.rows[0].is_nullable !== 'YES') throw new Error('name continua NOT NULL');
});
await check('nomes antigos preenchidos (legado mantém nome)', async () => {
  const r = await db.query(`SELECT name FROM items WHERE id=1`);
  if (r.rows[0].name !== 'Colar Legado') throw new Error('nome legado alterado indevidamente');
});

console.log('\n--- Depois da correção: comportamento esperado ---');
// INSERT exatamente como o app CORRIGIDO faz (com name derivado do modelo):
await check('INSERT novo do app (com name) cadastra peça', async () => {
  await db.exec(`
    INSERT INTO items (model_id, name, barcode, variant_id, size, price_cost, price_sale, status, owner_type, owner_id, acquisition_date)
    VALUES (1, 'Anel Solitário Prata 16', '12345678', NULL, '16', 0, 0, 'estoque', 'loja', NULL, NULL);
  `);
});
// Trigger protege INSERTs antigos (sem name), ex.: abas com versão antiga do app:
await check('trigger preenche name em INSERT sem name (modelo → nome)', async () => {
  await db.exec(`INSERT INTO items (model_id, barcode, status, owner_type) VALUES (1, '87654321', 'estoque', 'loja');`);
  const r = await db.query(`SELECT name FROM items WHERE barcode='87654321'`);
  if (r.rows[0].name !== 'Anel Solitário') throw new Error(`nome gerado inesperado: ${r.rows[0].name}`);
});
await check('trigger usa barcode quando não há modelo', async () => {
  await db.exec(`INSERT INTO items (barcode, status, owner_type) VALUES ('99998888', 'estoque', 'loja');`);
  const r = await db.query(`SELECT name FROM items WHERE barcode='99998888'`);
  if (r.rows[0].name !== '99998888') throw new Error(`nome gerado inesperado: ${r.rows[0].name}`);
});

const rows = await db.query(`SELECT id, name, barcode, model_id FROM items ORDER BY id`);
console.log('\ntabela items após testes:');
console.table(rows.rows);

process.exit(failures ? 1 : 0);
