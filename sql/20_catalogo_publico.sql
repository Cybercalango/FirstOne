-- =====================================================================
-- 20_catalogo_publico.sql
-- Prepara o banco para a LANDING PAGE + CATÁLOGO PÚBLICO (portada de Work/).
-- Idempotente: pode rodar mais de uma vez sem quebrar nada.
-- =====================================================================

-- 1) Colunas de catálogo na tabela items (se faltarem)
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS price NUMERIC(12,2);
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Joias';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS available BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Preenche `name` das peças já cadastradas (usa barcode como nome provisório se vazio)
UPDATE public.items SET name = COALESCE(barcode::text, 'Peça sem nome') WHERE name IS NULL;

-- 2) Leitura pública apenas do que foi publicado no catálogo.
--    (A policy dev_all_access existente continua valendo para usuários logados.)
DROP POLICY IF EXISTS catalogo_publico_read ON public.items;
CREATE POLICY catalogo_publico_read ON public.items
FOR SELECT TO anon USING (published = true AND available = true);

-- 3) Bucket público para fotos do catálogo
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalogo', 'catalogo', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS catalogo_public_read ON storage.objects;
CREATE POLICY catalogo_public_read ON storage.objects
FOR SELECT TO anon USING (bucket_id = 'catalogo');

DROP POLICY IF EXISTS catalogo_admin_write ON storage.objects;
CREATE POLICY catalogo_admin_write ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'catalogo' AND public.is_admin())
WITH CHECK (bucket_id = 'catalogo' AND public.is_admin());

-- 4) Conferência final
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='items'
ORDER BY column_name;
