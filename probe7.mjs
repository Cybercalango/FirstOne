import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec(`CREATE TABLE items(id INT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'estoque');
INSERT INTO items VALUES (1,'estoque');`);
// versao SEM search_path fixo
await db.exec(`CREATE OR REPLACE FUNCTION public.f1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE public.items SET status='emprestado' WHERE id=NEW.item_id; RETURN NEW; END $$;
CREATE TABLE sm1(item_id INT);
CREATE TRIGGER t1 AFTER INSERT ON sm1 FOR EACH ROW EXECUTE FUNCTION public.f1();
INSERT INTO sm1 VALUES (1);`);
console.log('sem search_path:', (await db.query('SELECT status FROM items')).rows);
await db.exec(`UPDATE items SET status='estoque';`);
// versao COM SECURITY DEFINER + SET search_path
await db.exec(`CREATE OR REPLACE FUNCTION public.f2() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN UPDATE public.items SET status='emprestado' WHERE id=NEW.item_id; RETURN NEW; END $$;
CREATE TABLE sm2(item_id INT);
CREATE TRIGGER t2 AFTER INSERT ON sm2 FOR EACH ROW EXECUTE FUNCTION public.f2();
INSERT INTO sm2 VALUES (1);`);
console.log('com security definer+search_path:', (await db.query('SELECT status FROM items')).rows);
// versao com bloco EXCEPTION interno
await db.exec(`UPDATE items SET status='estoque';
CREATE OR REPLACE FUNCTION public.f3() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from TEXT;
BEGIN
  BEGIN
    SELECT status INTO v_from FROM public.items WHERE id = NEW.item_id FOR UPDATE;
    UPDATE public.items SET status='emprestado' WHERE id = NEW.item_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;
  RETURN NEW;
END $$;
CREATE TABLE sm3(item_id INT);
CREATE TRIGGER t3 AFTER INSERT ON sm3 FOR EACH ROW EXECUTE FUNCTION public.f3();
INSERT INTO sm3 VALUES (1);`);
console.log('com bloco exception interno:', (await db.query('SELECT status FROM items')).rows);
