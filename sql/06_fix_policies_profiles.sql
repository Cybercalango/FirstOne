-- =====================================================================
-- 06_fix_policies_profiles.sql
-- VERSÃO FINAL: recria TODAS as políticas da tabela profiles.
-- Corre o risco anterior: se o perfil foi criado mas a política de
-- SELECT não permite que o próprio usuário leia a própria linha,
-- o login mostra "não possui um perfil de acesso".
-- Este script garante: cada usuário lê/edita o próprio perfil e
-- administradores gerenciam todos.
-- =====================================================================

-- 1) Remove TODAS as políticas atuais da tabela profiles
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='profiles'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- 2) Função auxiliar (SECURITY DEFINER evita recursão de RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'administrador'
  );
$$;

-- 3) Políticas definitivas
--    Qualquer usuário logado pode LER todos os perfis
--    (necessário para a tela Administração listar usuários).
CREATE POLICY profiles_select_all ON public.profiles
  FOR SELECT TO authenticated USING (true);

--    Cada usuário pode atualizar o PRÓPRIO perfil (mas sem se promover
--    a administrador — isso só um admin faz, checado pela função).
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND (role = 'vendedor' OR public.is_admin()));

--    Administradores fazem tudo em qualquer linha.
CREATE POLICY profiles_admin_all ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

--    Bootstrap seguro: o primeiro usuário do sistema (quando a tabela
--    está vazia) pode criar o próprio perfil como administrador.
CREATE POLICY profiles_bootstrap ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND (
      coalesce(role,'vendedor') <> 'administrador'
      OR NOT EXISTS (SELECT 1 FROM public.profiles)
    )
  );

-- 4) Garante que todo usuário de auth.users tenha perfil,
--    e que EXISTA pelo menos um administrador.
INSERT INTO public.profiles (id, email, nome, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'nome', ''),
  CASE WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'administrador')
       THEN 'administrador' ELSE 'vendedor' END
FROM auth.users u
WHERE u.id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles SET role = 'administrador'
WHERE id = (SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1)
AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'administrador');

-- 5) Resultado esperado: seu e-mail com role = administrador
SELECT id, email, nome, role, created_at FROM public.profiles ORDER BY created_at;
