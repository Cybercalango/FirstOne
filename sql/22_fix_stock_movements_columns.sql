-- Corrige "Could not find the 'quantity' column of 'stock_movements'"
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS movement_type TEXT; -- legado

-- Sincroniza type <-> movement_type
UPDATE public.stock_movements SET type = movement_type WHERE type IS NULL AND movement_type IS NOT NULL;
UPDATE public.stock_movements SET movement_type = type WHERE movement_type IS NULL AND type IS NOT NULL;

CREATE OR REPLACE FUNCTION public.stock_movements_sync_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type IS NULL AND NEW.movement_type IS NOT NULL THEN NEW.type := NEW.movement_type; END IF;
  IF NEW.movement_type IS NULL AND NEW.type IS NOT NULL THEN NEW.movement_type := NEW.type; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stock_movements_sync ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_sync
BEFORE INSERT OR UPDATE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.stock_movements_sync_type();

NOTIFY pgrst, 'reload schema';
