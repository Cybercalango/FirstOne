-- Cadastro com quantidade: aceita reason 'cadastro', reassegura colunas e corrige FK de histórico
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- Motivos aceitos (inclui 'cadastro')
DO $$ BEGIN
  ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_reason_check;
EXCEPTION WHEN others THEN NULL; END $$;

-- item_status_history.item_id precisa ser BIGINT quando items.id for BIGINT (evita 22003 out of range)
DO $$ BEGIN
  ALTER TABLE public.item_status_history ALTER COLUMN item_id TYPE BIGINT;
EXCEPTION WHEN others THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
