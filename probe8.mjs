import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
db.listen('pg_notice', n => console.log('NOTICE:', n.message));
await db.exec(`CREATE TABLE items(id INT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'estoque');
INSERT INTO items VALUES (1,'estoque');
CREATE TABLE sm(item_id INT, type TEXT, movement_type TEXT, reason TEXT, user_id UUID);
CREATE OR REPLACE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_from TEXT; v_tipo TEXT; v_status TEXT;
BEGIN
  v_tipo := COALESCE(NULLIF(btrim(COALESCE(NEW.type,'')), ''), NEW.movement_type, 'saida');
  v_status := CASE WHEN v_tipo = 'saida' THEN 'emprestado' ELSE 'estoque' END;
  BEGIN
    SELECT status INTO v_from FROM public.items WHERE id = NEW.item_id FOR UPDATE;
    UPDATE public.items SET status = v_status WHERE id = NEW.item_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER tr AFTER INSERT ON sm FOR EACH ROW EXECUTE FUNCTION f();`);
// agora o mesmo exec com a migracao inteira e FK/referencias completas
