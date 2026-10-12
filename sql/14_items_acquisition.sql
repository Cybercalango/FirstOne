-- =====================================================================
-- 14_items_acquisition.sql
-- Adiciona a coluna acquisition_date (data de aquisição) à tabela items,
-- que o cadastro de peças utiliza. Seguro para rodar mesmo se já existir.
-- Execute UMA VEZ no SQL Editor do Supabase.
-- =====================================================================

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS acquisition_date date DEFAULT CURRENT_DATE;

COMMENT ON COLUMN public.items.acquisition_date IS 'Data em que a peça foi adquirida';

-- Confirmação: deve listar a coluna acquisition_date
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='items'
ORDER BY ordinal_position;
