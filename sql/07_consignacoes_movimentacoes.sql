-- =====================================================================
-- 07_consignacoes_movimentacoes.sql
-- Separa Consignação e Movimentações de Estoque (entrada/saída) em
-- rotinas próprias, além de registrar o histórico de itens.
-- Execute no SQL Editor do Supabase.
-- =====================================================================

-- Histórico de status dos itens (rastreia entradas/saídas/vendas/consignações)
CREATE TABLE IF NOT EXISTS item_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,                 -- entrada | saida | venda | consignacao_devolvida | ajuste...
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Saídas de estoque (empréstimo interno ao vendedor/parceiro)
CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES items(id),
  person_id BIGINT NOT NULL REFERENCES people(id),
  type TEXT NOT NULL DEFAULT 'saida',      -- saida | entrada (retorno)
  quantity INT NOT NULL DEFAULT 1,
  notes TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consignações: remessas formais de peças a um parceiro, com prazo
CREATE TABLE IF NOT EXISTS consignments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consignor_id BIGINT NOT NULL REFERENCES people(id),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'ativa',    -- ativa | encerrada
  notes TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consignment_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consignment_id BIGINT NOT NULL REFERENCES consignments(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES items(id),
  returned BOOLEAN NOT NULL DEFAULT FALSE,
  returned_at TIMESTAMPTZ
);

-- Função central: muda o status de um item e grava o histórico
CREATE OR REPLACE FUNCTION public.set_item_status(
  p_item_id BIGINT, p_to_status TEXT, p_reason TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from TEXT;
BEGIN
  SELECT status INTO v_from FROM items WHERE id = p_item_id FOR UPDATE;
  IF v_from IS NULL THEN RAISE EXCEPTION 'Item % não encontrado', p_item_id; END IF;
  UPDATE items SET status = p_to_status WHERE id = p_item_id;
  INSERT INTO item_status_history (item_id, from_status, to_status, reason, user_id)
  VALUES (p_item_id, v_from, p_to_status, p_reason, auth.uid());
END $$;

-- Segurança: usuários logados gerenciam; admin total
ALTER TABLE item_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignment_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT; pol RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['item_status_history','stock_movements','consignments','consignment_items'] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY %I_read ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t, t);
  END LOOP;
END $$;
