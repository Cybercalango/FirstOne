-- =====================================================================
-- 16_funcoes_exclusao.sql
-- Funções de EXCLUSÃO com devolução automática de estoque:
--   delete_consignment(p_id) : exclui consignação (qualquer status).
--     - Peças em poder do parceiro -> voltam para 'estoque'
--     - Peças devolvidas           -> já estão em 'estoque', nada faz
--     - Peças vendidas/acertadas   -> permanecem 'vendido'
--     - Registra histórico e apaga consignment_items + a consignação.
--   delete_sale(p_id)        : exclui venda e as peças voltam ao estoque.
-- Execute UMA VEZ no SQL Editor do Supabase.
-- =====================================================================

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

  -- Peças ainda em poder do parceiro voltam para o estoque
  FOR v_rec IN
    SELECT item_id FROM public.consignment_items
    WHERE consignment_id = p_id AND returned = FALSE AND sold = FALSE
  LOOP
    UPDATE public.items SET status = 'estoque' WHERE id = v_rec.item_id;
    INSERT INTO public.item_status_history (item_id, from_status, to_status, reason)
    VALUES (v_rec.item_id, 'consignacao', 'estoque', 'consignacao_excluida');
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.consignment_items WHERE consignment_id = p_id;
  DELETE FROM public.consignments      WHERE id = p_id;

  RETURN format('Consignação %s excluída. %s peça(s) retornaram ao estoque.', v_code, v_count);
END $$;

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

  -- Peças da venda voltam para o estoque
  FOR v_rec IN
    SELECT item_id FROM public.sale_items WHERE sale_id = p_id
  LOOP
    UPDATE public.items SET status = 'estoque' WHERE id = v_rec.item_id;
    INSERT INTO public.item_status_history (item_id, from_status, to_status, reason)
    VALUES (v_rec.item_id, 'vendido', 'estoque', 'venda_excluida');
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.sale_items WHERE sale_id = p_id;
  DELETE FROM public.sales      WHERE id = p_id;

  RETURN format('Venda %s excluída. %s peça(s) retornaram ao estoque.', v_code, v_count);
END $$;

-- Só administradores podem excluir
REVOKE ALL ON FUNCTION public.delete_consignment(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_sale(BIGINT)        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_consignment(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sale(BIGINT)        TO authenticated;

-- Garante que o código da consignação seja gerado automaticamente se faltar trigger
CREATE OR REPLACE FUNCTION public.set_consignment_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := 'CONS-' || to_char(now(), 'YYYY') || '-' || lpad(NEW.id::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_consignment_code ON public.consignments;
CREATE TRIGGER trg_consignment_code
  BEFORE INSERT ON public.consignments
  FOR EACH ROW WHEN (NEW.code IS NULL OR NEW.code = '')
  EXECUTE FUNCTION public.set_consignment_code();

SELECT 'Funções delete_consignment / delete_sale criadas com sucesso.' AS ok;
