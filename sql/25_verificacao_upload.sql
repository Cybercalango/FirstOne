-- =====================================================================
-- 25_verificacao_upload.sql — diagnóstico do upload de fotos
-- Cole no SQL Editor e execute. Retorna 3 blocos:
--   A) colunas image_url/published na tabela items (existem? tipo?)
--   B) tamanho máximo configurado no bucket 'catalogo' (limite p/ imagens)
--   C) policies de storage do bucket (quem pode inserir/atualizar/apagar)
-- =====================================================================

-- A) Colunas da tabela items
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='items'
  AND column_name IN ('image_url','published','available','sort_order','description')
ORDER BY column_name;

-- B) Limites do bucket (file_size_limit = bytes;  null = sem limite)
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'catalogo';

-- C) Policies ativas no bucket 'catalogo'
SELECT policyname, permissive, cmd, roles::text
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
ORDER BY cmd, policyname;
