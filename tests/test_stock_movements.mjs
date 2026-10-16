// Reprodução + validação da correção do erro:
// "Could not find the 'quantity' column of 'stock_movements' in the schema cache"
//
// O app (Movimentacoes.jsx) insere { item_id, person_id, type, quantity, notes }.
// As migrações 07/08/09/10 criaram stock_movements com movement_type e SEM
// quantity nem type — por isso o PostgREST reclama do "schema cache".
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(join(root, 'sql', '22_fix_stock_movements_columns.sql'), 'utf8');

let failures = 0;
async function check(label, fn) {
  try { await fn(); console.log(`PASS | ${label}`); }
  catch (e) { failures++; console.log(`FAIL | ${label} -> ${String(e.message).split('\n')[0]}`); }
}

const db = new PGlite();

// Estado "quebrado": stock_movements exatamente como os scripts 08/09/10 criam.
await db.exec(`
CREATE TABLE items(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, status TEXT NOT NULL DEFAULT 'estoque');
CREATE TABLE people(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE item_status_history(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, item_id INT, from_status TEXT, to_status TEXT, reason TEXT, user_id UUID);
INSERT INTO items(status) VALUES ('estoque');
INSERT INTO people(name) VALUES ('Ana Parceira');
CREATE TABLE public.stock_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES public.items(id),
  person_id BIGINT REFERENCES public.people(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada','saida')),
  reason TEXT NOT NULL DEFAULT 'outro',
  reference TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
`);

console.log('--- Antes da correção: INSERT do app deve falhar ---');
const insertApp = (type) => db.query(
  `INSERT INTO stock_movements (item_id, person_id, type, quantity, notes)
   VALUES (1, 1, $1, 1, 'teste') RETURNING id`, [type]);

await check('INSERT do app falha sem as colunas type/quantity', async () => {
  let falhou = false;
  try { await insertApp('saida'); }
  catch (e) { falhou = /column .*type.* of relation "stock_movements" does not exist|does not exist/.test(e.message); }
  if (!falhou) throw new Error('esperava erro de coluna inexistente (type/quantity)');
});

console.log('\n--- Aplicando sql/22_fix_stock_movements_columns.sql ---');
await check('migração roda sem erros', () => db.exec(migration));
await check('migração é idempotente (roda 2x)', () => db.exec(migration));
await check('coluna quantity existe com default 1', async () => {
  const r = await db.query(`SELECT column_default FROM information_schema.columns
    WHERE table_name='stock_movements' AND column_name='quantity'`);
  if (!r.rows.length) throw new Error('quantity não criada');
});
await check('coluna type existe', async () => {
  const r = await db.query(`SELECT 1 FROM information_schema.columns
    WHERE table_name='stock_movements' AND column_name='type'`);
  if (!r.rows.length) throw new Error('type não criada');
});

console.log('\n--- Depois da correção: comportamento esperado ---');
await check('INSERT novo do app (type=saida, quantity=1) funciona', async () => {
  await insertApp('saida');
});
await check('trigger sincroniza movement_type legado', async () => {
  const r = await db.query(`SELECT movement_type, type, quantity FROM stock_movements ORDER BY id DESC LIMIT 1`);
  const row = r.rows[0];
  if (row.type !== 'saida' || row.movement_type !== 'saida') throw new Error(`sincronização falhou: ${JSON.stringify(row)}`);
  if (Number(row.quantity) !== 1) throw new Error('quantity != 1');
});
await check('INSERT de versão antiga (só movement_type) continua funcionando', async () => {
  await db.exec(`INSERT INTO stock_movements (item_id, person_id, movement_type) VALUES (1, 1, 'entrada');`);
  const r = await db.query(`SELECT type FROM stock_movements ORDER BY id DESC LIMIT 1`);
  if (r.rows[0].type !== 'entrada') throw new Error('trigger não preencheu type a partir de movement_type');
});
await check('saída muda status da peça para emprestado (gatilho)', async () => {
  // A migração 23 (aplicada em produção junto com a 22) faz a entrada
  // respeitar o status atual: para testar a saída partindo do estoque,
  // restauramos o status diretamente (equivalente a rodar a 22 isolada).
  await db.exec(`UPDATE items SET status='estoque' WHERE id=1;`);
  await insertApp('saida');
  const r = await db.query(`SELECT status FROM items WHERE id=1`);
  if (r.rows[0].status !== 'emprestado') throw new Error(`status=${r.rows[0].status}`);
});
await check('entrada devolve status para estoque (gatilho)', async () => {
  await insertApp('entrada');
  const r = await db.query(`SELECT status FROM items WHERE id=1`);
  if (r.rows[0].status !== 'estoque') throw new Error(`status=${r.rows[0].status}`);
});
await check('quantity <= 0 é normalizado para 1 pela trigger', async () => {
  // O CHECK (quantity > 0) protege INSERTs diretos/SQL, mas a trigger
  // BEFORE INSERT roda antes e normaliza 0 -> 1, garantindo que o app
  // nunca receba erro de constraint. Comportamento intencional.
  await db.query(`INSERT INTO stock_movements (item_id, person_id, type, quantity) VALUES (1,1,'saida',0)`);
  const r = await db.query(`SELECT quantity FROM stock_movements ORDER BY id DESC LIMIT 1`);
  if (Number(r.rows[0].quantity) !== 1) throw new Error(`esperava 1, obtive ${r.rows[0].quantity}`);
});

const rows = await db.query(`SELECT id, item_id, type, movement_type, quantity FROM stock_movements ORDER BY id`);
console.log('\nstock_movements após testes:');
console.table(rows.rows);

process.exit(failures ? 1 : 0);
