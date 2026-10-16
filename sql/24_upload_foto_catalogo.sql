-- Bucket público + policies de upload por usuário autenticado
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalogo', 'catalogo', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS catalogo_admin_write ON storage.objects;
DROP POLICY IF EXISTS catalogo_auth_insert ON storage.objects;
CREATE POLICY catalogo_auth_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS catalogo_auth_update ON storage.objects;
CREATE POLICY catalogo_auth_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS catalogo_auth_delete ON storage.objects;
CREATE POLICY catalogo_auth_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = auth.uid()::text);

NOTIFY pgrst, 'reload schema';
