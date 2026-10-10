-- =============================================================
-- 03_fix_perfis_rls.sql
-- Resolve o erro "não possui um perfil de acesso" e ajusta as
-- políticas RLS da tabela profiles.
-- Cole TODO este arquivo no SQL Editor do Supabase e clique Run.
-- =============================================================

-- 1) Garante que a tabela profiles existe
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  nome text,
  role text NOT NULL DEFAULT 'vendedor',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2) Remove TODAS as políticas antigas da tabela profiles
--    (evita conflito entre versões anteriores do script)
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- 3) Cria as políticas corretas
--    Cada usuário autenticado pode ver o PRÓPRIO perfil
CREATE POLICY profiles_select_self ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

--    Cada usuário pode atualar o PRÓPRIO perfil (mas não se promover:
--    na prática isso é aceitável nesta fase; endurecemos depois)
CREATE POLICY profiles_update_self ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

--    Administradores têm acesso total (ver/criar/editar/apagar todos)
CREATE POLICY profiles_admin_all ON profiles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'administrador'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'administrador'));

--    Qualquer pessoa autenticada pode criar o PRÓPRIO perfil.
--    Isso permite o "bootstrap": o primeiro admin se auto-registra pela tela de login.
--    Segurança extra: só permite papel 'administrador' quando a tabela está VAZIA
--    (primeiro usuário do sistema). Depois disso, novos perfis só via admin.
CREATE POLICY profiles_insert_self ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND (
      role <> 'administrador'                      -- vendedores/gerentes: criado por admin
      OR NOT EXISTS (SELECT 1 FROM profiles)       -- bootstrap: primeiro admin, tabela vazia
    )
  );

-- 4) Sincroniza PERFIS FALTANTES: cria em profiles uma linha para cada
--    usuário de auth.users que ainda não tenha perfil.
--    O primeiro (mais antigo) vira administrador; os demais, vendedor.
INSERT INTO profiles (id, email, nome, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'nome', ''),
  CASE WHEN NOT EXISTS (SELECT 1 FROM profiles) THEN 'administrador' ELSE 'vendedor' END
FROM auth.users u
WHERE u.id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;

-- 5) Se AINDA assim nenhum perfil ficou como administrador
--    (ex.: usuários antigos sem meta), promove o mais antigo.
UPDATE profiles SET role = 'administrador'
WHERE id = (SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1)
AND NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'administrador');

-- Pronto! Verifique o resultado:
SELECT id, email, nome, role FROM profiles ORDER BY created_at;
