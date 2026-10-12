-- =====================================================================
-- 13_consignacoes_melhorias.sql
-- Melhora o fluxo de consignacoes:
--   * permite status 'cancelada'
--   * cria end_date (data do acerto/encerramento) se nao existir
--   * garante funcoes RPC usadas pela tela (set_item_status e
--     mark_consignment_item_sold) mesmo se scripts anteriores falharam
-- Execute no SQL Editor do Supabase.
-- =====================================================================

-- 1) Status aceita 'cancelada'
ALTER TABLE public.consignments DROP CONSTRAINT IF EXISTS consignments_status_check;
ALTER TABLE public.consignments ADD CONSTRAINT consignments_status_check
  CHECK (status IN ('ativa','encerrada','cancelada'));

-- 2) Coluna end_date (se nao existir)
ALTER TABLE public.consignments ADD COLUMN IF NOT EXISTS end_date DATE;

-- 3) Funcao set_item_status (marcar situacao da peca + historico)
CREATE OR REPLACE FUNCTION public.set_item_status(
  p_item_id BIGINT, p_to_status TEXT, p_reason TEXT DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from TEXT;
BEGIN
  SELECT status INTO v_from FROM public.items WHERE id = p_item_id FOR UPDATE;
  UPDATE public.items SET status = p_to_status WHERE id = p_item_id;
  IF to_regclass('public.item_status_history') IS NOT NULL THEN
    INSERT INTO public.item_status_history (item_id, from_status, to_status, reason, user_id)
    VALUES (p_item_id, v_from, p_to_status, p_reason, auth.uid());
  END IF;
END $$;

-- 4) Funcao mark_consignment_item_sold (acerto marca itens como vendidos)
CREATE OR REPLACE FUNCTION public.mark_consignment_item_sold(p_item_id BIGINT)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.consignment_items
     SET sold = TRUE, sold_at = now()
   WHERE item_id = p_item_id AND sold = FALSE AND returned = FALSE;
$$;

GRANT EXECUTE ON FUNCTION public.set_item_status(BIGINT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_consignment_item_sold(BIGINT) TO authenticated;

SELECT 'OK: consignacoes melhoradas' AS resultado;
