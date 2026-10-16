-- Corrige "null value in column \"name\" of relation \"items\""
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.items ALTER COLUMN name DROP NOT NULL;

UPDATE public.items
SET name = COALESCE(
      (SELECT m.name FROM public.models m WHERE m.id = items.model_id),
      barcode::text,
      'Peça #' || id::text
    )
WHERE name IS NULL OR btrim(name) = '';

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

NOTIFY pgrst, 'reload schema';

-- Conferência: deve retornar name | YES
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='items' AND column_name='name';
