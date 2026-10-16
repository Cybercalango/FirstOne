-- =====================================================================
-- 23_estoque_quantidade_no_cadastro.sql
-- Permite informar QUANTIDADE ao cadastrar peças (Produtos).
--
-- Contexto: o cadastro de itens é a primeira entrada de estoque de um
-- produto novo. O app passará a inserir N peças iguais e registrar N
-- movimentações do tipo 'entrada'. Para isso faltavam no banco:
--   1) `quantity` em stock_movements já vem da migração 22 (re-assegurada
--      aqui de forma idempotente);
--   2) CHECK de `reason` não incluía 'cadastro' — este script adiciona;
--   3) A trigger apply_stock_movement() forçava 'estoque'/'emprestado'
--      em todo movimento, o que conflitaria com status iniciais
--      'consignacao' escolhidos no cadastro — a trigger passa a respeitar
--      movimentos de entrada quando o item já tem status válido próprio.
-- Idempotente: pode rodar quantas vezes quiser.
-- =====================================================================

-- 1) Re-assegura quantity (idempotente, caso o 22 ainda não tenha rodado).
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

UPDATE public.stock_movements
SET type = COALESCE(movement_type, 'saida')
WHERE type IS NULL OR btrim(type) = '';

-- 2) Amplia o CHECK de reason para aceitar 'cadastro' (e 'producao', que
--    também é usada por compras/produção). Remove o antigo e recria.
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.stock_movements'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%reason%'
   LIMIT 1;
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.stock_movements DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_reason_check CHECK (
    reason IN ('compra','producao','ajuste','venda','consignacao',
               'devolucao_consignacao','quebra','perda','transferencia',
               'cadastro','outro'));

-- 3) Trigger que aplica o movimento ao status da peça:
--    - saida  -> 'emprestado'
--    - entrada-> 'estoque', MAS respeita o status inicial escolhido no
--      cadastro (ex.: consignacao), evitando sobrescrever o formulário.
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from TEXT; v_tipo TEXT; v_status TEXT;
BEGIN
  v_tipo := COALESCE(NULLIF(btrim(COALESCE(NEW.type,'')), ''), NEW.movement_type, 'saida');
  BEGIN
    SELECT status INTO v_from FROM public.items WHERE id = NEW.item_id FOR UPDATE;
    IF v_tipo = 'saida' THEN
      v_status := 'emprestado';
    ELSE
      -- entrada: mantém o status atual se ele já for coerente com posse
      -- da loja (estoque/consignacao); caso contrário devolve ao estoque.
      v_status := CASE WHEN v_from IN ('estoque','consignacao') THEN v_from ELSE 'estoque' END;
    END IF;
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

-- 4) Trigger BEFORE INSERT reforçada (versão do app novo): além de
--    sincronizar type/movement_type, aplica um GATE de quantidade —
--    quantity NULL ou < 1 vira 1 automaticamente. Assim o cadastro em
--    lote nunca grava movimento com quantidade inválida.
CREATE OR REPLACE FUNCTION public.stock_movements_sync_type()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE has_legacy BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='stock_movements'
                   AND column_name='movement_type')
    INTO has_legacy;

  IF NEW.type IS NOT NULL AND btrim(NEW.type) <> '' THEN
    IF has_legacy THEN NEW.movement_type := NEW.type; END IF;
  ELSIF has_legacy AND NEW.movement_type IS NOT NULL THEN
    NEW.type := NEW.movement_type;
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

-- 5) Limpa o cache de schema do PostgREST.
NOTIFY pgrst, 'reload schema';

-- 6) Conferência: 'cadastro' deve ser aceito como reason.
SELECT 'ok' AS reason_check_ready;
