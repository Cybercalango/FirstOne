-- =====================================================================
-- 17_recria_funcoes_e_policies.sql
-- CORRIGE: "Could not find the function public.delete_consignment(p_id)"
-- Causa: o script 16 não foi executado (ou falhou no meio) e, além disso,
-- o DROP GLOBAL de policies apagou as políticas das tabelas de apoio
-- (item_status_history, sales, sale_items), travando as funções.
-- Este script é IDEMPOTENTE: pode rodar de novo sem erro.
-- Execute UMA VEZ no SQL Editor do Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) FUNÇÃO delete_consignment(p_id) — excluir consignação devolvendo
--    ao estoque apenas as peças que NÃO foram vendidas/acertadas.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_consignment(p_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec   RECORD;
  v_code  TEXT;
  v_count INTEGER := 0;
BEGIN
  SELECT code INTO v_code FROM public.consignments WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consignação % não encontrada', p_id; END IF;

  FOR v_rec IN
    SELECT item_id FROM public.consignment_items
    WHERE consignment_id = p_id AND returned = FALSE AND sold = FALSE
  LOOP
    UPDATE public.items SET status = 'estoque' WHERE id = v_rec.item_id;
    BEGIN
      INSERT INTO public.item_status_history (item_id, from_status, to_status, reason)
      VALUES (v_rec.item_id, 'consignacao', 'estoque', 'consignacao_excluida');
    EXCEPTION WHEN undefined_table THEN NULL; -- histórico opcional
    END;
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.consignment_items WHERE consignment_id = p_id;
  DELETE FROM public.consignments      WHERE id = p_id;

  RETURN format('Consignação %s excluída. %s peça(s) retornaram ao estoque.', v_code, v_count);
END $$;

-- ---------------------------------------------------------------------
-- 2) FUNÇÃO delete_sale(p_id) — excluir venda e devolver as peças
--    ao estoque (com histórico).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_sale(p_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec   RECORD;
  v_code  TEXT;
  v_count INTEGER := 0;
BEGIN
  SELECT code INTO v_code FROM public.sales WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda % não encontrada', p_id; END IF;

  FOR v_rec IN
    SELECT item_id FROM public.sale_items WHERE sale_id = p_id
  LOOP
    UPDATE public.items SET status = 'estoque' WHERE id = v_rec.item_id;
    BEGIN
      INSERT INTO public.item_status_history (item_id, from_status, to_status, reason)
      VALUES (v_rec.item_id, 'vendido', 'estoque', 'venda_excluida');
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.sale_items WHERE sale_id = p_id;
  DELETE FROM public.sales      WHERE id = p_id;

  RETURN format('Venda %s excluída. %s peça(s) retornaram ao estoque.', v_code, v_count);
END $$;

-- ---------------------------------------------------------------------
-- 3) Garante a função is_admin() (usada pelas políticas abaixo)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'administrador'
  );
$$;

-- ---------------------------------------------------------------------
-- 4) RECRÍA as políticas de TODAS as tabelas do sistema
--    (leitura para usuários logados; escrita irrestrita em dev com
--     política "write_all" — endureça depois com is_admin() se quiser)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t   TEXT;
  pol RECORD;
  tabs TEXT[] := ARRAY[
    'profiles','types','variants','size_grids','grid_sizes','models',
    'people','items','item_status_history',
    'consignments','consignment_items','consignment_status_history',
    'stock_movements','sales','sale_items'
  ];
BEGIN
  FOREACH t IN ARRAY tabs LOOP
    -- pula tabelas inexistentes
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    FOR pol IN SELECT policyname FROM pg_policies
               WHERE schemaname='public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('CREATE POLICY read_all ON public.%I FOR SELECT TO anon, authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY write_all ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 5) Permissões de execução das funções
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.delete_consignment(BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sale(BIGINT)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()                 TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) Conferência final — deve listar as 2 funções e as políticas
-- ---------------------------------------------------------------------
SELECT p.proname AS funcao
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname IN ('delete_consignment','delete_sale','is_admin')
ORDER BY 1;
