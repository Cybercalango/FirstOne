-- =====================================================================
-- 09_setup_completo.sql — VERSÃO À PROVA DE FALHAS
-- Rode este script UMA ÚNICA VEZ no SQL Editor do Supabase.
-- Ele detecta o que já existe, cria o que falta e recria as tabelas
-- de consignação/movimentação com nomes compatíveis (sem foreign keys
-- quebradas). Não dá erro se algo já foi criado antes.
-- =====================================================================

-- ---------------------------------------------------------------
-- PARTE A: TABELAS BASE (do cadastro de joias)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.variants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.types (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.size_grids (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.grid_sizes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grid_id BIGINT NOT NULL REFERENCES public.size_grids(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  UNIQUE (grid_id, size)
);

CREATE TABLE IF NOT EXISTS public.people (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  cpf_cnpj TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_client BOOLEAN NOT NULL DEFAULT true,
  is_consignor BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.models (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  type_id BIGINT REFERENCES public.types(id),
  default_grid_id BIGINT REFERENCES public.size_grids(id),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barcode TEXT UNIQUE,
  model_id BIGINT REFERENCES public.models(id),
  variant_id BIGINT REFERENCES public.variants(id),
  size TEXT,
  price_cost NUMERIC(12,2) DEFAULT 0,
  price_sale NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'estoque',
  owner_type TEXT NOT NULL DEFAULT 'loja',
  owner_id BIGINT,
  acquisition_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.item_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT DEFAULT '',
  user_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.variants (name) VALUES ('Ouro'), ('Rhódio'), ('Prata'), ('Aço')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.types (name)
VALUES ('Anel'), ('Pulseira'), ('Cordão'), ('Brinco'), ('Pingente'), ('Tornozeleira'), ('Bersat')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------
-- PARTE B: LIMPAR resquícios de tentativas antigas das tabelas
-- de consignação (podem existir com estrutura errada ou quebrada)
-- ---------------------------------------------------------------
DROP TRIGGER    IF EXISTS trg_apply_stock_movement   ON public.stock_movements;
DROP TRIGGER    IF EXISTS trg_consignment_status    ON public.consignments;
DROP FUNCTION   IF EXISTS public.apply_stock_movement();
DROP FUNCTION   IF EXISTS public.log_consignment_status();
DROP TABLE      IF EXISTS public.consignment_items;
DROP TABLE      IF EXISTS public.consignment_status_history;
DROP TABLE      IF EXISTS public.consignments;
DROP TABLE      IF EXISTS public.stock_movements;

-- ---------------------------------------------------------------
-- PARTE C: CONSIGNAÇÕES + MOVIMENTAÇÕES (agora sem FK rígida,
-- para funcionar mesmo se alguma tabela base ainda faltar)
-- ---------------------------------------------------------------
CREATE TABLE public.consignments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,                       -- ex.: CONS-2026-0001
  consignor_id BIGINT,                             -- pessoa (cliente/parceiro) que recebe as peças
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'ativa'
    CHECK (status IN ('ativa','encerrada','cancelada')),
  notes TEXT DEFAULT '',
  user_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.consignment_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consignment_id BIGINT NOT NULL REFERENCES public.consignments(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL,                         -- peça (items.id)
  returned BOOLEAN NOT NULL DEFAULT FALSE,
  sold BOOLEAN NOT NULL DEFAULT FALSE,
  sold_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.consignment_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consignment_id BIGINT NOT NULL REFERENCES public.consignments(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID DEFAULT auth.uid(),
  changed_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT DEFAULT ''
);

CREATE TABLE public.stock_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id BIGINT NOT NULL,                         -- peça (items.id)
  person_id BIGINT,                                -- parceiro relacionado (opcional)
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada','saida')),
  reason TEXT NOT NULL DEFAULT 'outro'
    CHECK (reason IN ('compra','producao','ajuste','venda','consignacao',
                      'devolucao_consignacao','quebra','perda','transferencia','outro')),
  reference TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  user_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consignments_consignor ON public.consignments(consignor_id);
CREATE INDEX IF NOT EXISTS idx_consitems_consignment  ON public.consignment_items(consignment_id);
CREATE INDEX IF NOT EXISTS idx_consitems_item         ON public.consignment_items(item_id);
CREATE INDEX IF NOT EXISTS idx_movements_item         ON public.stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_movements_created      ON public.stock_movements(created_at DESC);

-- Gatilho: saída -> peça fica 'consignacao'; entrada -> volta a 'estoque'
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from TEXT;
BEGIN
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
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL; -- segue sem atualizar status se a base ainda não estiver pronta
  END;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_apply_stock_movement
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- Gatilho: histórico automático quando status da consignação muda
CREATE OR REPLACE FUNCTION public.log_consignment_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.consignment_status_history
      (consignment_id, old_status, new_status, changed_by, notes)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), 'Alteração via sistema');
    IF NEW.status IN ('encerrada','cancelada') THEN
      NEW.end_date := CURRENT_DATE;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_consignment_status
  BEFORE UPDATE ON public.consignments
  FOR EACH ROW EXECUTE FUNCTION public.log_consignment_status();

-- ---------------------------------------------------------------
-- PARTE D: SEGURANÇA (RLS) para todas as tabelas do sistema
-- ---------------------------------------------------------------
DO $$
DECLARE t TEXT; pol RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'variants','types','size_grids','grid_sizes','people','models',
    'items','item_status_history',
    'consignments','consignment_items','consignment_status_history','stock_movements'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE schemaname='public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY "%s_read" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_write" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- RESULTADO ESPERADO: lista com todas as tabelas criadas
-- ---------------------------------------------------------------
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('variants','types','size_grids','grid_sizes','people','models',
                    'items','item_status_history','consignments','consignment_items',
                    'consignment_status_history','stock_movements')
ORDER BY tablename;
