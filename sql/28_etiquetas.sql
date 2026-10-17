-- =====================================================================
-- 28_etiquetas.sql
-- Banco do módulo de IMPRESSÃO DE ETIQUETAS (tela /etiquetas)
-- ---------------------------------------------------------------------
--   * label_prints        : histórico de emissões (quem/quando/quantas)
--   * label_print_items   : detalhe por peça e nº de cópias emitidas
--   * lookup_item_por_codigo(codigo TEXT) : resolve código novo OU legado
--     base-NN para o item consolidado (usa items_barcode_aliases do sql/27),
--     para PDV/leitor encontrar a etiqueta antiga.
-- Idempotente: pode rodar mais de uma vez sem efeitos colaterais.
-- Obs.: depende das tabelas public.items e public.items_barcode_aliases
--       (criada pelo sql/27); execute os dois scripts na ordem.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.label_prints (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  printed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  total_labels INT  NOT NULL DEFAULT 0,
  printer      TEXT,                       -- 'browser' | 'zpl' | endpoint
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.label_print_items (
  print_id BIGINT NOT NULL REFERENCES public.label_prints(id) ON DELETE CASCADE,
  item_id  BIGINT NOT NULL REFERENCES public.items(id)        ON DELETE CASCADE,
  copies   INT NOT NULL DEFAULT 1 CHECK (copies >= 1),
  PRIMARY KEY (print_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_label_print_items_item ON public.label_print_items(item_id);

ALTER TABLE public.label_prints       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_print_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can manage label prints" ON public.label_prints;
CREATE POLICY "authenticated can manage label prints"
  ON public.label_prints FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated can manage label print items" ON public.label_print_items;
CREATE POLICY "authenticated can manage label print items"
  ON public.label_print_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Alias da tabela de aliases do sql/27 (criada só na etapa 6 dele). Se o 27
-- ainda não rodou neste banco, cria-se aqui a estrutura mínima equivalente
-- (mesmas colunas) para que esta migration seja aplicável de forma isolada.
CREATE TABLE IF NOT EXISTS public.items_barcode_aliases (
  barcode    TEXT PRIMARY KEY,
  item_id    BIGINT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Resolve um código lido (novo de 8 dígitos ou legado base-NN) no item atual.
-- Prioridade: barcode exato em items > alias consolidado (sql/27) > código-base.
CREATE OR REPLACE FUNCTION public.lookup_item_por_codigo(p_codigo TEXT)
RETURNS TABLE (item_id BIGINT, barcode TEXT, resolved_via TEXT)
LANGUAGE sql STABLE AS $$
  SELECT c.item_id, i.barcode, r.resolved_via
  FROM LATERAL (
    SELECT COALESCE(
      -- 1) hit exato em items.barcode: o item "dono" do código atual vence
      (SELECT x.id FROM public.items x
        WHERE x.barcode = translate(p_codigo, ' -', '') LIMIT 1),
      -- 2) alias legado exato (base-NN consolidado pelo sql/27)
      (SELECT a.item_id FROM public.items_barcode_aliases a
        WHERE a.barcode = translate(p_codigo, ' -', '') LIMIT 1),
      -- 3) código-base do alias (sem o sufixo -NN)
      (SELECT k.item_id FROM public.items_barcode_aliases k
        WHERE translate(k.barcode, ' -', '') = translate(p_codigo, ' -', '') LIMIT 1)
    ) AS item_id
  ) AS c
  JOIN public.items i ON i.id = c.item_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN i.barcode = translate(p_codigo, ' -', '') THEN 'items.barcode'::TEXT
      ELSE 'alias'::TEXT
    END AS resolved_via
  ) AS r
  WHERE c.item_id IS NOT NULL
  LIMIT 1;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Conferência
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('label_prints','label_print_items');
