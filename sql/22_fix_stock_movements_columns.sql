-- =====================================================================
-- 22_fix_stock_movements_columns.sql
-- Corrige o erro ao registrar movimentação de estoque:
--   "Could not find the 'quantity' column of 'stock_movements' in the
--    schema cache"
--
-- Causa raiz (reproduzida em teste local — ver tests/test_stock_movements.mjs):
-- o app (src/pages/Movimentacoes.jsx) insere e lê as colunas
-- `type` e `quantity`, mas as migrações 07/08/09/10 criaram a tabela
-- stock_movements com `movement_type` e SEM `quantity`. O PostgREST,
-- ao receber uma coluna inexistente, devolve exatamente esta mensagem
-- de "schema cache".
--
-- Correção em duas frentes:
--   1) Banco (este script): adiciona `type` e `quantity` à tabela
--      (mantendo `movement_type` por compatibilidade e sincronizando
--      as duas via trigger), mais NOTIFY pgrst para limpar o cache.
--   2) App (Movimentacoes.jsx): leitura do histórico passa a usar
--      m.type (nome real da coluna).
-- Idempotente: pode rodar quantas vezes quiser.
-- =====================================================================

-- 1) Colunas novas: type (espelho de movement_type) e quantity.
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'stock_movements_quantity_check'
                   AND conrelid = 'public.stock_movements'::regclass) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_quantity_check CHECK (quantity > 0);
  END IF;
END $$;

-- 2) Preenche `type` a partir de `movement_type` nas linhas existentes.
UPDATE public.stock_movements
SET type = COALESCE(movement_type, 'saida')
WHERE type IS NULL OR btrim(type) = '';

-- 3) Trigger BEFORE INSERT: mantém type/movement_type sincronizados e
--    garante quantity >= 1. Funciona tanto para o app novo (envia type)
--    quanto para qualquer versão antiga (envia movement_type).
CREATE OR REPLACE FUNCTION public.stock_movements_sync_type()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE has_legacy BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='stock_movements'
                   AND column_name='movement_type')
    INTO has_legacy;

  IF NEW.type IS NOT NULL AND btrim(NEW.type) <> '' THEN
    IF has_legacy THEN NEW.movement_type := NEW.type; END IF;   -- espelha no legado
  ELSIF has_legacy AND NEW.movement_type IS NOT NULL THEN
    NEW.type := NEW.movement_type;                               -- versão antiga do app
  ELSE
    NEW.type := 'saida';
    IF has_legacy THEN NEW.movement_type := 'saida'; END IF;
  END IF;

  IF NEW.quantity IS NULL OR NEW.quantity < 1 THEN
    NEW.quantity := 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stock_movements_sync_type ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_sync_type
BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.stock_movements_sync_type();

-- 4) Gatilho que aplica o movimento ao status da peça passa a aceitar
--    ambos os nomes de coluna (type ou movement_type) e o status
--    'emprestado' usado pelo app nas saídas (empréstimo a parceiros).
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from TEXT; v_tipo TEXT; v_status TEXT;
BEGIN
  v_tipo := COALESCE(NULLIF(btrim(COALESCE(NEW.type,'')), ''), NEW.movement_type, 'saida');
  v_status := CASE WHEN v_tipo = 'saida' THEN 'emprestado' ELSE 'estoque' END;
  BEGIN
    SELECT status INTO v_from FROM public.items WHERE id = NEW.item_id FOR UPDATE;
    UPDATE public.items SET status = v_status WHERE id = NEW.item_id;
    INSERT INTO public.item_status_history (item_id, from_status, to_status, reason, user_id)
    VALUES (NEW.item_id, v_from, v_status, COALESCE(NULLIF(NEW.reason,''), v_tipo), NEW.user_id);
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL; -- segue registrando a movimentação mesmo se a base estiver incompleta
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_stock_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_stock_movement
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- 5) Limpa o cache de schema do PostgREST (resolve o "in the schema cache").
NOTIFY pgrst, 'reload schema';

-- 6) Conferência: deve listar type e quantity entre as colunas.
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='stock_movements'
ORDER BY ordinal_position;
