-- =====================================================================
-- 18_items_colunas_pesquisa.sql
-- Corrige o erro: "column items.model_id does not exist" na pesquisa.
-- Adiciona TODAS as colunas usadas pelo app na tabela `items`,
-- cria a FK do modelo e limpa o cache de schema do PostgREST.
-- Idempotente: pode rodar quantas vezes quiser.
-- =====================================================================

-- 1) Garante que a tabela models existe (usada pela pesquisa/cadastro).
CREATE TABLE IF NOT EXISTS public.models (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type_id BIGINT REFERENCES public.types(id),
  grid_id BIGINT REFERENCES public.size_grids(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Adiciona QUALQUER coluna que esteja faltando em items.
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

-- 3) Cria a chave estrangeira model_id -> models.id (se ainda não existir).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.items'::regclass AND contype = 'f'
      AND conname LIKE '%model_id%'
  ) THEN
    ALTER TABLE public.items
      ADD CONSTRAINT items_model_id_fkey
      FOREIGN KEY (model_id) REFERENCES public.models(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4) Índice para acelerar a pesquisa por modelo/status.
CREATE INDEX IF NOT EXISTS idx_items_model  ON public.items(model_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON public.items(status);

-- 5) Limpa o cache de schema do PostgREST (resolve erros
--    "Could not find the column ... in the schema cache").
NOTIFY pgrst, 'reload schema';

-- Relatório final: liste as colunas reais de items.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='items'
ORDER BY ordinal_position;
