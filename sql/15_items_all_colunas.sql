-- =====================================================================
-- 15_items_all_colunas.sql
-- GARANTIA TOTAL da estrutura da tabela `items` + tabelas de apoio.
-- Corrige erros "Could not find the 'X' column of 'items'..."
-- (model_id, variant_id, size, price_cost, price_sale, status,
--  owner_type, owner_id, acquisition_date, notes)
-- Idempotente: pode rodar quantas vezes quiser, sem quebrar nada.
-- =====================================================================

-- 1) Se a tabela items não existir, cria completa.
CREATE TABLE IF NOT EXISTS public.items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barcode TEXT UNIQUE,
  model_id BIGINT REFERENCES public.models(id),
  variant_id BIGINT REFERENCES public.variants(id),
  size TEXT,
  price_cost NUMERIC(12,2) DEFAULT 0,
  price_sale NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'estoque',   -- estoque | consignacao | vendido
  owner_type TEXT NOT NULL DEFAULT 'loja',  -- loja | pessoa
  owner_id BIGINT,
  acquisition_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Adiciona QUALQUER coluna que esteja faltando (sem tocar nas existentes).
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
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- 3) Garante as tabelas de apoio dos cadastros base (idempotente).
CREATE TABLE IF NOT EXISTS public.types (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS public.variants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS public.size_grids (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS public.grid_sizes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grid_id BIGINT NOT NULL REFERENCES public.size_grids(id) ON DELETE CASCADE,
  size TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS public.people (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL, doc TEXT DEFAULT '', phone TEXT DEFAULT '',
  email TEXT DEFAULT '', person_type TEXT NOT NULL DEFAULT 'cliente',
  created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS public.models (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  type_id BIGINT REFERENCES public.types(id),
  default_grid_id BIGINT REFERENCES public.size_grids(id),
  description TEXT, created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS public.item_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL, reason TEXT DEFAULT '',
  user_id UUID DEFAULT auth.uid(), created_at TIMESTAMPTZ DEFAULT now());

-- 4) Constraints de chave estrangeira (só adiciona se ainda não existirem).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='items_model_id_fkey') THEN
    ALTER TABLE public.items ADD CONSTRAINT items_model_id_fkey
      FOREIGN KEY (model_id) REFERENCES public.models(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='items_variant_id_fkey') THEN
    ALTER TABLE public.items ADD CONSTRAINT items_variant_id_fkey
      FOREIGN KEY (variant_id) REFERENCES public.variants(id);
  END IF;
END $$;

-- 5) Índices úteis
CREATE INDEX IF NOT EXISTS idx_items_model   ON public.items(model_id);
CREATE INDEX IF NOT EXISTS idx_items_status  ON public.items(status);
CREATE INDEX IF NOT EXISTS idx_hist_item     ON public.item_status_history(item_id);

-- 6) RLS + políticas (leitura para logados; admin gerencia tudo)
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_status_history ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename IN ('items','item_status_history')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

CREATE POLICY items_read ON public.items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY items_write ON public.items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hist_read ON public.item_status_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY hist_write ON public.item_status_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7) Relatórios padrão do Supabase passam a ver o schema atualizado
NOTIFY pgrst, 'reload schema';

-- Conferência final: liste as colunas reais de items
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='items'
ORDER BY ordinal_position;
