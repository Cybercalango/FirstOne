import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const mig = readFileSync('sql/22_fix_stock_movements_columns.sql','utf8');
const db = new PGlite();
db.listen('pg_notice', n => console.log('NOTICE:', n.message));
await db.exec(`
CREATE TABLE items(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, status TEXT NOT NULL DEFAULT 'estoque');
CREATE TABLE people(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE item_status_history(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, item_id INT, from_status TEXT, to_status TEXT, reason TEXT, user_id UUID);
INSERT INTO items(status) VALUES ('estoque');
CREATE TABLE public.stock_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES public.items(id),
  person_id BIGINT REFERENCES public.people(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada','saida')),
  reason TEXT NOT NULL DEFAULT 'outro',
  reference TEXT DEFAULT '', notes TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT now());`);
await db.exec(mig);
console.log('constraints:', await db.query(`SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.stock_movements'::regclass`));
// insere com movement_type explicito para isolar o trigger apply
await db.query(`INSERT INTO stock_movements (item_id, type, quantity, movement_type) VALUES (1,'saida',1,'saida')`);
console.log('items:', (await db.query('SELECT * FROM items')).rows);
console.log('hist:', (await db.query('SELECT * FROM item_status_history')).rows);
try { await db.query(`INSERT INTO stock_movements (item_id, movement_type, quantity) VALUES (1,'saida',0)`); console.log('q=0 aceito'); } catch(e){ console.log('q=0 erro:', e.message.split('\n')[0]); }
