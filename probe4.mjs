import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const mig = readFileSync('sql/22_fix_stock_movements_columns.sql','utf8');
const db = new PGlite();
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
console.log(await db.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.stock_movements'::regclass AND NOT tgisinternal`));
await db.query(`INSERT INTO stock_movements (item_id, person_id, type, quantity, notes) VALUES (1, NULL, 'saida', 1, 'x')`);
console.log('items:', await db.query('SELECT * FROM items'));
console.log('hist:', await db.query('SELECT * FROM item_status_history'));
try { await db.query(`INSERT INTO stock_movements (item_id, type, quantity) VALUES (1,'saida',0)`); console.log('q=0 aceito??'); } catch(e){ console.log('q=0 erro:', e.message.split('\n')[0]); }
console.log('cols:', await db.query(`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='stock_movements'`));
