-- =====================================================================
-- 26_items_origem_legado.sql
-- Origem do código interno das peças: GERADO (sistema) x LEGADO (etiqueta antiga).
-- Idempotente: pode rodar quantas vezes quiser.
--
-- Contexto de projeto (estoque por quantidade, sql/27):
--   * A identificação legado x gerado é derivada do próprio `barcode`:
--       - código do sistema  -> exatamente 8 dígitos (opcionalmente sufixo
--         sequencial -NN de versões antigas do app, ex.: 40670211-06);
--       - qualquer outro valor (ex.: EAN-13, códigos antigos de etiqueta)
--         -> LEGADO. O app mostra um "*" ao lado desses códigos em todas
--         as listagens e no romaneio impresso.
--   * Esta coluna existe por conveniência de relatório/auditoria; o app
--     NÃO depende dela para funcionar (usa a regex acima).
-- =====================================================================

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS origem_codigo TEXT
  NOT NULL DEFAULT 'gerado'
  CHECK (origem_codigo IN ('gerado', 'legado'));

-- Classifica o estoque já existente: tudo que não segue o formato do
-- sistema passa a 'legado'; o resto permanece 'gerado'.
UPDATE public.items
SET origem_codigo = CASE
      WHEN barcode IS NULL OR btrim(barcode) = '' THEN 'gerado'
      WHEN regexp_replace(barcode, '-[0-9]{2}$', '') ~ '^[0-9]{8}$' THEN 'gerado'
      ELSE 'legado'
    END;

-- Conferência (opcional): distribuição por origem.
-- SELECT origem_codigo, count(*) FROM items GROUP BY origem_codigo;

NOTIFY pgrst, 'reload schema';
