import { readFileSync, writeFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const mig = readFileSync('sql/22_fix_stock_movements_columns.sql','utf8');
const db = new PGlite();
await db.exec(`CREATE TABLE items(id INT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'estoque');
INSERT INTO items VALUES (1,'estoque');`);
writeFileSync('/tmp/mig_body.txt', mig.slice(mig.indexOf('CREATE OR REPLACE FUNCTION public.apply_stock_movement')));
console.log('apply fn presente na migracao?', mig.includes('public.apply_stock_movement'));
// executa so a parte do apply
await db.exec(mig.slice(mig.indexOf('-- 4) Gatilho'), mig.indexOf('-- 5)')));
await db.exec(`CREATE TABLE sm(id INT, type TEXT, movement_type TEXT, item_id INT, reason TEXT, user_id UUID);
CREATE TRIGGER tr AFTER INSERT ON sm FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();
INSERT INTO sm VALUES (1,'saida',NULL,1,NULL,NULL);`);
console.log('items:', (await db.query('SELECT * FROM items')).rows);
