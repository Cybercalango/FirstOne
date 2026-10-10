-- =====================================================================
-- 08_consignacoes_movimentacoes_FINAL.sql
-- VERSÃO CORRIGIDA: usa as tabelas REAIS do sistema (items, people,
-- models, variants) em vez de customers/products/product_variants.
-- Execute UMA VEZ no SQL Editor do Supabase.
-- Pré-requisito: o script 02 (cadastros base) já foi executado.
-- =====================================================================

-- 1) TABELA: consignments (consignações — remessas a parceiros)
CREATE TABLE IF NOT EXISTS public.consignments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,                       -- ex.: CONS-2026-0001
  consignor_id BIGINT NOT NULL REFERENCES public.people(id),  -- quem recebe as peças
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,   -- data da saída das peças
  due_date DATE,                                   -- prazo de devolução/venda
  end_date DATE,                                   -- data de encerramento
  status TEXT NOT NULL DEFAULT 'ativa'
    CHECK (status IN ('ativa','encerrada','cancelada')),
  notes TEXT DEFAULT '',
  user_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) TABELA: consignment_items (peças dentro de cada consignação)
CREATE TABLE IF NOT EXISTS public.consignment_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consignment_id BIGINT NOT NULL REFERENCES public.consignments(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES public.items(id),
  returned BOOLEAN NOT NULL DEFAULT FALSE,         -- peça devolvida?
  sold BOOLEAN NOT NULL DEFAULT FALSE,             -- peça vendida em consignação?
  sold_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3) TABELA: consignment_status_history (histórico de status)
CREATE TABLE IF NOT EXISTS public.consignment_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consignment_id BIGINT NOT NULL REFERENCES public.consignments(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID DEFAULT auth.uid(),
  changed_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT DEFAULT ''
);

-- 4) TABELA: stock_movements (entradas e saídas de estoque por peça)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES public.items(id),
  person_id BIGINT REFERENCES public.people(id),   -- parceiro/cliente relacionado (opcional)
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada','saida')),
  reason TEXT NOT NULL DEFAULT 'outro'
    CHECK (reason IN ('compra','producao','ajuste','venda','consignacao',
                      'devolucao_consignacao','quebra','perda','transferencia','outro')),
  reference TEXT DEFAULT '',                       -- nº nota, nº consignação...
  notes TEXT DEFAULT '',
  user_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para desempenho
CREATE INDEX IF NOT EXISTS idx_consignments_consignor ON public.consignments(consignor_id);
CREATE INDEX IF NOT EXISTS idx_consignments_status    ON public.consignments(status);
CREATE INDEX IF NOT EXISTS idx_consitems_consignment  ON public.consignment_items(consignment_id);
CREATE INDEX IF NOT EXISTS idx_consitems_item         ON public.consignment_items(item_id);
CREATE INDEX IF NOT EXISTS idx_movements_item         ON public.stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_movements_created      ON public.stock_movements(created_at DESC);

-- 5) GATILHO: ao registrar entrada/saída, atualiza o status da peça
--    e grava o histórico em item_status_history.
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from TEXT;
BEGIN
  SELECT status INTO v_from FROM public.items WHERE id = NEW.item_id FOR UPDATE;

  IF NEW.movement_type = 'saida' THEN
    UPDATE public.items SET status = 'consignacao' WHERE id = NEW.item_id;
    INSERT INTO public.item_status_history (item_id, from_status, to_status, reason, user_id)
    VALUES (NEW.item_id, v_from, 'consignacao', COALESCE(NEW.reason,'saida'), NEW.user_id);
  ELSE
    UPDATE public.items SET status = 'estoque' WHERE id = NEW.item_id;
    INSERT INTO public.item_status_history (item_id, from_status, to_status, reason, user_id)
    VALUES (NEW.item_id, v_from, 'estoque', COALESCE(NEW.reason,'entrada'), NEW.user_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_stock_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_stock_movement
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- 6) GATILHO: registra histórico quando o status da consignação muda
CREATE OR REPLACE FUNCTION public.log_consignment_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.consignment_status_history
      (consignment_id, old_status, new_status, changed_by, notes)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), 'Alteração via painel/app');
    NEW.end_date := CASE WHEN NEW.status IN ('encerrada','cancelada')
                         THEN CURRENT_DATE ELSE NEW.end_date END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_consignment_status ON public.consignments;
CREATE TRIGGER trg_consignment_status
  BEFORE UPDATE ON public.consignments
  FOR EACH ROW EXECUTE FUNCTION public.log_consignment_status();

-- 7) POLÍTICAS RLS (leitura para logados; escrita apenas administradores)
ALTER TABLE public.consignments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consignment_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consignment_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements            ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT; pol RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['consignments','consignment_items','consignment_status_history','stock_movements']
  LOOP
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE schemaname='public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY "%s_read"  ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_write" ON public.%I FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t, t);
  END LOOP;
END $$;

-- Conferência final: todas as 4 tabelas e suas políticas devem existir
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('consignments','consignment_items','consignment_status_history','stock_movements')
ORDER BY tablename;
