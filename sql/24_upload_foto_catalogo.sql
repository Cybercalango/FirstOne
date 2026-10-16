-- =====================================================================
-- 24_upload_foto_catalogo.sql
-- Habilita o upload de fotos do catálogo direto pelo gerenciador
-- (Produtos → botão "Publicar no site" / câmera).
--
-- O script 20 criou o bucket público 'catalogo', mas a policy de escrita
-- exigia public.is_admin(); usuários com role 'vendedor' recebiam
-- "new row violates row-level security policy" ao enviar a foto.
-- Esta versão permite escrita autenticada em catalogo/<auth.uid()>/ e
-- também apaga/edita apenas os próprios arquivos. Leitura pública continua
-- liberada para anon (a landing mostra as imagens).
-- Idempotente: pode rodar quantas vezes quiser.
-- =====================================================================

-- Garante que o bucket existe e é público.
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalogo', 'catalogo', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Substitui a antiga policy admin-only pela versão por-usuário.
DROP POLICY IF EXISTS catalogo_admin_write ON storage.objects;

DROP POLICY IF EXISTS catalogo_auth_insert ON storage.objects;
CREATE POLICY catalogo_auth_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'catalogo'
            AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS catalogo_auth_update ON storage.objects;
CREATE POLICY catalogo_auth_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS catalogo_auth_delete ON storage.objects;
CREATE POLICY catalogo_auth_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = auth.uid()::text);

-- A leitura pública (catalogo_public_read, criada no script 20) permanece:
-- SELECT TO anon USING (bucket_id = 'catalogo').

-- Recarrega o cache de schema do PostgREST/Storage.
NOTIFY pgrst, 'reload schema';

-- Conferência: deve listar as 3 policies novas + a de leitura pública.
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'catalogo%';
