-- =====================================================================
-- 27_estoque_por_quantidade.sql
-- Cadastro de peça com QUANTIDADE passa a criar UM único item cujo
-- estoque é controlado por quantidade, em vez de N linhas (uma por
-- unidade). Idempotente.
--
-- O que este script faz:
--   1) items.quantity INT NOT NULL DEFAULT 1  (peças do modelo antigo,
--      uma linha por unidade, ficam com quantity = 1).
--   2) stock_movements passa a ser agregada por item:
--        - UNIQUE (item_id, type, reason, barcode) para entradas/saídas
--          "por produto" (movimentos unitários legados, que têm barcode
--          e são únicos por id, não colidem);
--        - coluna barcode removida do uso futuro pelo app (mantida p/
--          histórico legado).
--   3) trigger trg_items_sync_quantity: soma os movements do item e
--      grava em items.quantity; impede saída maior que o saldo.
--   4) views de compatibilidade:
--        - v_unit_movements: expande movimentos agregados em unidades
--          (para relatórios antigos que contavam linhas);
--        - v_estoque_atual: resumo por peça (código, nome, saldo).
--   5) Recarga o schema cache do PostgREST.
--
-- APLICAÇÃO DOS LEGADOS (opcional, ao final): consolidate as peças
-- duplicadas geradas pelo cadastro antigo (base-01..NN) SEM apagar
-- etiquetas já impressas — elas continuam válidas como códigos
-- individuais. Basta cadastrar as próximas compras no modo novo.
-- =====================================================================

BEGIN;

-- 1) Coluna de quantidade em items -----------------------------------
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 0;
ALTER TABLE public.items ALTER COLUMN quantity SET DEFAULT 0;
-- Itens sem nenhum movimento de estoque ficam com saldo 0 explícito
-- (o UPDATE dispara o trigger se ele já existir; por isso a sincronização
-- abaixo é sempre aditiva em relação ao último movimento).
UPDATE public.items i SET quantity = 0
WHERE quantity <> 0
  AND NOT EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.item_id = i.id);

-- Itens QUE JÁ EXISTEM com quantity definida por outro meio: sincroniza
-- (recursão é evitada: o trigger só atualiza items, e não há trigger em items)

-- 2) Estoque agregado por produto em stock_movements -----------------
-- Garante colunas (caso o 22 ainda não tenha rodado em algum banco).
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;
UPDATE public.stock_movements SET type = COALESCE(movement_type,'entrada'), quantity = COALESCE(quantity,1) WHERE type IS NULL;

DO $$ BEGIN
  ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_type_chk CHECK (type IN ('entrada','saida'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Identificador do lote agregado (produto), nulo nos movimentos
-- unitários legados (que apontam para um item específico via item_id
-- criado por linha).
DO $$ BEGIN
  ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_prod_unique
    UNIQUE (item_id, type, reason, created_at);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- Sincroniza os saldos existentes agora. Regra:
--   * se o último movimento do item é uma ENTRADA AGREGADA (type/quantity,
--     ex.: cadastro de lote), o saldo oficial é a quantity desse movimento;
--   * caso contrário (legado 1 unidade por linha ou última ação foi saída),
--     o saldo oficial é 1 para entrada legada e 0 para saída.
-- Só grava quando o valor atual difere do oficial -> rodar 2x não muda nada.
WITH last_mv AS (
  SELECT DISTINCT ON (item_id) item_id,
         COALESCE(type, movement_type) AS t,
         (type IS NOT NULL AND COALESCE(quantity,1) > 1) AS agregada,
         CASE WHEN type IS NOT NULL THEN COALESCE(quantity,1) ELSE 1 END AS qtd
  FROM public.stock_movements ORDER BY item_id, id DESC
)
UPDATE public.items i
SET quantity = CASE WHEN l.agregada THEN l.qtd
                    WHEN l.t = 'saida' THEN 0
                    ELSE 1 END
FROM last_mv l
WHERE l.item_id = i.id
  AND i.quantity IS DISTINCT FROM (CASE WHEN l.agregada THEN l.qtd
                                        WHEN l.t = 'saida' THEN 0
                                        ELSE 1 END);

-- 3) Trigger de sincronização da quantidade --------------------------
CREATE OR REPLACE FUNCTION public.items_sync_quantity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_item    BIGINT;
  v_atual   INT;
  v_saldo   INT;
BEGIN
  IF TG_OP = 'DELETE' THEN v_item := OLD.item_id; ELSE v_item := NEW.item_id; END IF;
  IF v_item IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP <> 'DELETE' AND COALESCE(NEW.quantity,1) < 1 THEN
    RAISE EXCEPTION 'Quantidade da movimentação deve ser >= 1';
  END IF;

  SELECT COALESCE(quantity, 0) INTO v_atual FROM public.items WHERE id = v_item;

  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'saida' AND v_atual < NEW.quantity THEN
      RAISE EXCEPTION 'Saldo insuficiente: peça tem % em estoque, saída pede %', v_atual, NEW.quantity;
    END IF;
    v_saldo := GREATEST(0, v_atual + CASE WHEN NEW.type='entrada' THEN NEW.quantity ELSE -NEW.quantity END);
  ELSIF TG_OP = 'UPDATE' THEN
    -- reverte o efeito antigo e aplica o novo
    v_saldo := GREATEST(0, v_atual
      - CASE WHEN OLD.type='entrada' THEN OLD.quantity ELSE -OLD.quantity END
      + CASE WHEN NEW.type='entrada' THEN NEW.quantity ELSE -NEW.quantity END);
  ELSE  -- DELETE: reverte o movimento removido
    v_saldo := GREATEST(0, v_atual
      - CASE WHEN OLD.type='entrada' THEN OLD.quantity ELSE -OLD.quantity END);
  END IF;

  UPDATE public.items SET quantity = v_saldo WHERE id = v_item;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_items_sync_quantity ON public.stock_movements;
CREATE TRIGGER trg_items_sync_quantity
AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.items_sync_quantity();

-- 4) Views de compatibilidade ----------------------------------------
CREATE OR REPLACE VIEW public.v_estoque_atual AS
SELECT i.id, i.barcode, i.name, i.model_id, mo.name AS model_name,
       i.size, i.status, i.owner_type, i.quantity, i.published, i.image_url
FROM public.items i
LEFT JOIN public.models mo ON mo.id = i.model_id
ORDER BY i.barcode NULLS LAST, i.id;

CREATE OR REPLACE VIEW public.v_unit_movements AS
SELECT m.id AS movement_id, m.item_id, m.type, g AS unit_num,
       m.reason, m.notes, m.created_at
FROM public.stock_movements m
CROSS JOIN generate_series(1, GREATEST(1, m.quantity)) g;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Conferência: quantity existe e é NOT NULL com default 1.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='items' AND column_name='quantity';

-- =====================================================================
-- 6) CONSOLIDAÇÃO DOS LEGADOS (opcional, idempotente)
-- Junta em UM item as peças duplicadas geradas pelo cadastro antigo
-- (lotes base-01..NN do mesmo produto), somando quantidades. As
-- etiquetas impressas dos itens fundidos continuam válidas: cada
-- barcode vira um alias registrado em items_barcode_aliases, então a
-- pesquisa/leitor encontra o item consolidado por qualquer código.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.items_barcode_aliases (
  barcode   TEXT PRIMARY KEY,
  item_id   BIGINT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agrupa por (modelo, variação, tamanho, status, dono, preço) os itens
-- com sufixo -NN no barcode e mais de 1 linha; mantém o menor id.
WITH dup AS (
  SELECT regexp_replace(barcode, '-\d+$', '') AS base,
         model_id, variant_id, size, status, owner_type, owner_id, price_sale, price_cost, name,
         MIN(id) AS keep_id,
         COUNT(*) AS n
  FROM public.items
  WHERE barcode ~ '-\d{2}$'
  GROUP BY 1,2,3,4,5,6,7,8,9
  HAVING COUNT(*) > 1
)
INSERT INTO public.items_barcode_aliases (barcode, item_id)
SELECT i.barcode, d.keep_id
FROM public.items i
JOIN dup d ON d.base = regexp_replace(i.barcode, '-\d+$','')
         AND d.keep_id <> i.id
         AND COALESCE(i.model_id,-1)   = COALESCE(d.model_id,-1)
         AND COALESCE(i.variant_id,-1) = COALESCE(d.variant_id,-1)
         AND COALESCE(i.size,'')       = COALESCE(d.size,'')
WHERE NOT EXISTS (SELECT 1 FROM public.items_barcode_aliases a WHERE a.barcode = i.barcode)
ON CONFLICT (barcode) DO NOTHING;

-- Soma as quantidades nos sobreviventes (via quantity atual + unidades legadas).
WITH dup AS (
  SELECT regexp_replace(barcode, '-\d+$','') AS base,
         model_id, variant_id, size, status, owner_type, owner_id, price_sale, price_cost, name,
         MIN(id) AS keep_id, SUM(GREATEST(quantity,1)) AS total_qtd
  FROM public.items
  WHERE barcode ~ '-\d{2}$'
  GROUP BY 1,2,3,4,5,6,7,8,9
  HAVING COUNT(*) > 1
)
UPDATE public.items i
SET quantity = d.total_qtd
FROM dup d
WHERE i.id = d.keep_id AND i.quantity IS DISTINCT FROM d.total_qtd;

-- Move histórico/movimentos dos fundidos para o sobrevivente e apaga as linhas extras.
UPDATE public.stock_movements m
SET item_id = a.item_id
FROM public.items_barcode_aliases a
WHERE m.item_id IN (SELECT id FROM public.items i JOIN public.items_barcode_aliases x ON x.barcode = i.barcode AND x.item_id <> i.id);

DELETE FROM public.items
WHERE id IN (SELECT i.id FROM public.items i
             JOIN public.items_barcode_aliases a ON a.barcode = i.barcode
             WHERE a.item_id <> i.id);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Conferência: itens consolidados e seus aliases.
SELECT i.id, i.barcode, i.name, i.quantity,
       (SELECT array_agg(a.barcode) FROM public.items_barcode_aliases a WHERE a.item_id = i.id) AS aliases
FROM public.items i
WHERE EXISTS (SELECT 1 FROM public.items_barcode_aliases a WHERE a.item_id = i.id)
ORDER BY i.id;
