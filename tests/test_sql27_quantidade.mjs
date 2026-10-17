// Testa sql/27_estoque_por_quantidade.sql num banco PGlite simulando o Supabase:
//  - cadastro de QTD agora = 1 linha em items com quantity=N
//  - trigger sincroniza items.quantity a partir dos stock_movements
//  - saída maior que o saldo é bloqueada
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mig27 = readFileSync(join(root, 'sql', '27_estoque_por_quantidade.sql'), 'utf8');

let failures = 0;
async function check(label, fn) {
  try { await fn(); console.log(`PASS | ${label}`); }
  catch (e) { failures++; console.log(`FAIL | ${label} -> ${String(e.message).split('\n')[0]}`); }
}

const db = new PGlite();
await db.exec(`
CREATE TABLE models(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE items(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, quantity INT NOT NULL DEFAULT 1, barcode TEXT UNIQUE, name TEXT, model_id BIGINT, size TEXT, status TEXT DEFAULT 'estoque', owner_type TEXT DEFAULT 'loja', price_sale NUMERIC(12,2) DEFAULT 0, published BOOLEAN DEFAULT false, image_url TEXT);
CREATE TABLE stock_movements(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, item_id BIGINT, movement_type TEXT, reason TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT now());
INSERT INTO models(name) VALUES ('Pulseira fina');
-- peça legada já cadastrada no modelo antigo (1 linha/unidade), com entrada unitária:
INSERT INTO items(barcode,name,model_id) VALUES ('00010243','Anel Solitário',1);
INSERT INTO stock_movements(item_id,movement_type,reason) VALUES (1,'entrada','cadastro');
`);

console.log('--- Aplicando sql/27 ---');
await check('migração roda sem erros', () => db.exec(mig27));
await check('migração é idempotente (roda 2x)', () => db.exec(mig27));
await check('coluna items.quantity existe NOT NULL default 0', async () => {
  const r = await db.query(`SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name='items' AND column_name='quantity'`);
  if (!r.rows.length || r.rows[0].is_nullable !== 'NO') throw new Error('quantity ausente ou nullable');
  if (!String(r.rows[0].column_default).startsWith('0')) throw new Error(`default=${r.rows[0].column_default}, esperado 0`);
});
await check('saldo legado sincronizado (1 entrada → quantity=1)', async () => {
  const r = await db.query(`SELECT quantity FROM items WHERE id=1`);
  if (Number(r.rows[0].quantity) !== 1) throw new Error(`quantity=${r.rows[0].quantity}, esperado 1`);
});

console.log('--- Novo fluxo: 1 produto com quantidade 6 ---');
await check('insert único de 1 linha + 1 movimento agregado de 6', async () => {
  await db.exec(`
    INSERT INTO items(barcode,name,model_id,size) VALUES ('40670211','Pulseira fina',1,'Único');
    INSERT INTO stock_movements(item_id,type,quantity,reason) VALUES (2,'entrada',6,'cadastro');
  `);
  const c = await db.query(`SELECT count(*)::int AS n FROM items WHERE barcode='40670211'`);
  if (c.rows[0].n !== 1) throw new Error(`linhas de items=${c.rows[0].n}, esperado 1`);
  const q = await db.query(`SELECT quantity FROM items WHERE barcode='40670211'`);
  if (Number(q.rows[0].quantity) !== 6) throw new Error(`quantity=${q.rows[0].quantity}, esperado 6`);
});
await check('saída de 2 baixa saldo para 4 via trigger', async () => {
  await db.exec(`INSERT INTO stock_movements(item_id,type,quantity,reason) VALUES (2,'saida',2,'venda');`);
  const r = await db.query(`SELECT quantity FROM items WHERE id=2`);
  if (Number(r.rows[0].quantity) !== 4) throw new Error(`quantity=${r.rows[0].quantity}, esperado 4`);
});
await check('saída maior que o saldo é recusada', async () => {
  let recusado = false;
  try { await db.exec(`INSERT INTO stock_movements(item_id,type,quantity,reason) VALUES (2,'saida',99,'venda');`); }
  catch (e) { recusado = /Saldo insuficiente/.test(e.message); }
  if (!recusado) throw new Error('deveria ter bloqueado saída acima do saldo');
  const r = await db.exec(`SELECT quantity FROM items WHERE id=2`); // saldo intacto
});
await check('view v_estoque_atual expõe saldo por código', async () => {
  const r = await db.query(`SELECT quantity FROM v_estoque_atual WHERE barcode='40670211'`);
  if (Number(r.rows[0].quantity) !== 4) throw new Error(`view retornou ${r.rows[0].quantity}`);
});

process.exit(failures ? 1 : 0);
