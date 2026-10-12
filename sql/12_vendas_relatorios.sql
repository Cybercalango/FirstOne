-- =====================================================================
-- 12_vendas_relatorios.sql
-- Vendas (PDV) + integração com consignação + relatórios.
-- Execute UMA VEZ no SQL Editor do Supabase.
-- =====================================================================

-- 1) Tabela de vendas (cabeçalho)
CREATE TABLE IF NOT EXISTS public.sales (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE,                              -- ex.: VEND-000001 (gerado no trigger)
  customer_id BIGINT REFERENCES public.people(id) ON DELETE SET NULL,
  consignment_id BIGINT REFERENCES public.consignments(id) ON DELETE SET NULL, -- venda oriunda de cobrança de consignação
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'dinheiro',        -- dinheiro, pix, cartao, outro
  notes TEXT DEFAULT '',
  user_id UUID DEFAULT auth.uid(),               -- vendedor que registrou
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Itens da venda
CREATE TABLE IF NOT EXISTS public.sale_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sale_id BIGINT NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  item_id BIGINT REFERENCES public.items(id) ON DELETE SET NULL,
  unit_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_created   ON public.sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer  ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_saleitems_sale  ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_saleitems_item  ON public.sale_items(item_id);

-- 3) Código automático da venda
CREATE OR REPLACE FUNCTION public.set_sale_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.code := 'VEND-' || lpad(NEW.id::text, 6, '0');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sale_code ON public.sales;
CREATE TRIGGER trg_sale_code
  BEFORE INSERT ON public.sales
  FOR EACH ROW WHEN (NEW.code IS NULL)
  EXECUTE FUNCTION public.set_sale_code();

-- 4) Marca a peça como vendida na consignação quando ela é vendida
--    (usado pela tela "Cobrar itens pendentes").
CREATE OR REPLACE FUNCTION public.mark_consignment_item_sold(p_item_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.consignment_items
     SET sold = TRUE, sold_at = now()
   WHERE item_id = p_item_id AND returned = FALSE AND sold = FALSE;
END $$;

-- 5) Políticas RLS (leitura para logados; escrita para todos os logados —
--    vendedores precisam registrar vendas).
ALTER TABLE public.sales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT; pol RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales','sale_items']
  LOOP
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE schemaname='public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY "%s_read"  ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_write" ON public.%I FOR ALL    TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- Conferência final:
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('sales','sale_items') ORDER BY tablename;

-- 6) Garantia: coluna "sold" na tabela consignment_items (caso a versão
--    anterior da tabela não a tenha).
ALTER TABLE public.consignment_items
  ADD COLUMN IF NOT EXISTS sold BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.consignment_items
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;
