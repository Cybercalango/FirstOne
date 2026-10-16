import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const mig = readFileSync('sql/22_fix_stock_movements_columns.sql','utf8');
const db = new PGlite();
await db.exec(`CREATE TABLE items(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, status TEXT NOT NULL DEFAULT 'estoque');
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

// instrumenta a funcao para gravar progresso em uma tabela de log
await db.exec(`CREATE TABLE dbg(step TEXT, info TEXT)`);
await db.exec(`CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_from TEXT; v_tipo TEXT; v_status TEXT;
BEGIN
  INSERT INTO dbg VALUES ('enter', COALESCE(NEW.type,'NULL-type')||'|'||COALESCE(NEW.movement_type,'NULL-mt'));
  v_tipo := COALESCE(NULLIF(btrim(COALESCE(NEW.type,'')), ''), NEW.movement_type, 'saida');
  v_status := CASE WHEN v_tipo = 'saida' THEN 'emprestado' ELSE 'estoque' END;
  INSERT INTO dbg VALUES ('vars', v_tipo||'|'||v_status);
  BEGIN
    SELECT status INTO v_from FROM public.items WHERE id = NEW.item_id FOR UPDATE;
    INSERT INTO dbg VALUES ('select', 'v_from='||COALESCE(v_from,'NULL'));
    UPDATE public.items SET status = v_status WHERE id = NEW.item_id;
    INSERT INTO dbg VALUES ('update', 'ok');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO dbg VALUES ('exception', SQLERRM);
  END;
  RETURN NEW;
END $$;`)
;
await db.query(`INSERT INTO stock_movements (item_id, type, quantity) VALUES (1,'saida',1)`);
console.log((await db.query('SELECT * FROM dbg')).rows);
console.log('items:', (await db.query('SELECT * FROM items')).rows);
