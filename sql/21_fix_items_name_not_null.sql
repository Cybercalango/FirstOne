-- =====================================================================
-- 21_fix_items_name_not_null.sql
-- Corrige o erro: "null value in column \"name\" of relation \"items\"
--  violates not-null constraint" ao cadastrar peças (Produtos).
--
-- Causa raiz (reproduzida em teste local — ver tests/test_items.mjs):
-- quando a tabela `items` do projeto foi criada a partir da tabela
-- legada `products` (o script 10_verificar_e_corrigir_tudo.sql faz
-- `ALTER TABLE products RENAME TO items`), ela herda a coluna
-- `name TEXT NOT NULL`. O INSERT do app não envia `name`, então o
-- Postgres rejeita o cadastro. Os scripts 15/18 usam
-- `ADD COLUMN IF NOT EXISTS`, que NÃO adiciona a restrição — mas
-- também nunca REMOVE o NOT NULL herdado da tabela antiga.
--
-- Correção em duas frentes:
--   1) Banco (este script): remove o NOT NULL de `items.name`,
--      preenche nomes antigos e cria um trigger que gera o nome
--      automaticamente (nome do modelo > código de barras > id).
--   2) App (src/pages/Produtos.jsx): passa a enviar `name` no
--      insert, com validação de nome/código antes de salvar.
-- Idempotente: pode rodar quantas vezes quiser.
-- =====================================================================

-- 1) Garante que a coluna name existe (para bancos criados só pelos
--    scripts 02/09/15/18, que não a têm) e que é NULLABLE.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.items ALTER COLUMN name DROP NOT NULL;

-- 2) Preenche o nome das peças já cadastradas que estão sem nome.
UPDATE public.items
SET name = COALESCE(
      (SELECT m.name FROM public.models m WHERE m.id = items.model_id),
      barcode::text,
      'Peça #' || id::text
    )
WHERE name IS NULL OR btrim(name) = '';

-- 3) Trigger: se um INSERT chegar sem `name` (ex.: versão antiga do
--    app ou outra integração), o banco preenche sozinho — o cadastro
--    nunca mais falha por causa disso.
CREATE OR REPLACE FUNCTION public.items_set_name()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    IF NEW.model_id IS NOT NULL THEN
      SELECT m.name INTO NEW.name FROM public.models m WHERE m.id = NEW.model_id;
    END IF;
    NEW.name := COALESCE(
      NULLIF(btrim(COALESCE(NEW.name,'')), ''),
      NEW.barcode,
      'Peça #' || COALESCE(NEW.id::text, 'sem nome')
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_items_set_name ON public.items;
CREATE TRIGGER trg_items_set_name
BEFORE INSERT ON public.items
FOR EACH ROW EXECUTE FUNCTION public.items_set_name();

-- 4) Limpa o cache de schema do PostgREST.
NOTIFY pgrst, 'reload schema';

-- 5) Conferência: `name` deve aparecer com is_nullable = 'YES'.
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='items' AND column_name='name';
