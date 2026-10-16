// Reprodução do bug: "null value in column \"name\" of relation \"items\" violates not-null constraint"
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

async function run(label, fn) {
  try {
    await fn();
    console.log(`OK   | ${label}`);
  } catch (e) {
    console.log(`FAIL | ${label} -> ${e.message.split('\n')[0]}`);
    return false;
  }
  return true;
}

// ---------- Cenário A: banco com legado 'products' renomeado para 'items' (script 10) ----------
await db.exec(`
CREATE TABLE variants(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE types(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE size_grids(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE grid_sizes(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, grid_id INT NOT NULL, size TEXT NOT NULL);
CREATE TABLE people(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE models(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL);
-- Tabela legada de "produtos" que o script 10 renomeia para "items":
CREATE TABLE products(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL, price NUMERIC(12,2) DEFAULT 0);
INSERT INTO products(name, price) VALUES ('Colar Legado', 10);
`);

console.log('--- Cenário A: items criado via RENAME da tabela legada products (name NOT NULL herdado) ---');
await run('RENAME products -> items (PASSO 2 do script 10)', async () => {
  await db.exec(`ALTER TABLE public.products RENAME TO items;`);
});
await run('ADD COLUMN IF NOT EXISTS das migrações 15/18', async () => {
  await db.exec(`
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
  `);
});
// INSERT exatamente como o app faz hoje (Produtos.jsx addItem): SEM a coluna "name"
const insertApp = () => db.exec(`
  INSERT INTO items (model_id, barcode, variant_id, size, price_cost, price_sale, status, owner_type, owner_id, acquisition_date)
  VALUES (NULL, '12345678', NULL, NULL, 0, 0, 'estoque', 'loja', NULL, NULL);
`);
const bugReproduzido = await run('INSERT do app em items (sem name)', async () => {
  const res = await insertApp();
  if (res.length !== 1) throw new Error('INSERT deveria ter falhado');
});
if (!bugReproduzido) {
  // confirmamos a mensagem exata do erro
  try { await insertApp(); } catch (e) {
    console.log('     erro real:', e.message.replace(/\n/g, ' ').slice(0, 160));
  }
}

console.log('\n--- Teste da correção proposta (coluna name nullable + preenchida automaticamente) ---');
await db.exec(`
ALTER TABLE public.items ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Joias';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS available BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;
UPDATE public.items SET name = COALESCE(barcode::text, 'Peça sem nome') WHERE name IS NULL;
CREATE OR REPLACE FUNCTION public.items_set_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    SELECT m.name INTO NEW.name FROM public.models m WHERE m.id = NEW.model_id;
    NEW.name := COALESCE(NEW.name, NEW.barcode, 'Peça #' || COALESCE(NEW.id::text, 'sem nome'));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_items_set_name ON public.items;
CREATE TRIGGER trg_items_set_name BEFORE INSERT ON public.items FOR EACH ROW EXECUTE FUNCTION public.items_set_name();
`);
await run('INSERT do app após correção (sem name)', insertApp);
await run('INSERT com modelo existente (nome vem do modelo)', async () => {
  await db.exec(`
    INSERT INTO models(name) VALUES ('Anel Solitário');
    INSERT INTO items (model_id, barcode, status, owner_type) VALUES ((SELECT id FROM models WHERE name='Anel Solitário'), '87654321', 'estoque', 'loja');
  `);
});
const rows = await db.query(`SELECT id, name, barcode, model_id FROM items ORDER BY id`);
console.log('\nsituação final da tabela items:');
console.table(rows.rows);

// ---------- Cenário B: banco novo, sem legado ----------
const db2 = new PGlite();
console.log('\n--- Cenário B: schema novo conforme scripts 02/09/15/18 + 20 ---');
await db2.exec(`
CREATE TABLE variants(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE types(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE size_grids(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE grid_sizes(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, grid_id INT NOT NULL, size TEXT NOT NULL);
CREATE TABLE people(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE models(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL, type_id INT, default_grid_id INT, description TEXT);
CREATE TABLE items(id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, barcode TEXT UNIQUE, model_id INT, variant_id INT, size TEXT, price_cost NUMERIC(12,2) DEFAULT 0, price_sale NUMERIC(12,2) DEFAULT 0, status TEXT NOT NULL DEFAULT 'estoque', owner_type TEXT NOT NULL DEFAULT 'loja', owner_id INT, acquisition_date DATE, notes TEXT, created_at TIMESTAMPTZ DEFAULT now());
`);
await run('INSERT do app em schema novo (sem coluna name)', async () => {
  await db2.exec(`INSERT INTO items (model_id, barcode, status, owner_type) VALUES (NULL, '11112222', 'estoque', 'loja');`);
});
await run('Aplicar 20_catalogo_publico.sql em schema novo: name adicionado NULLABLE — ok', async () => {
  await db2.exec(`ALTER TABLE public.items ADD COLUMN IF NOT EXISTS name TEXT; UPDATE public.items SET name = COALESCE(barcode::text,'Peça sem nome') WHERE name IS NULL;`);
});
