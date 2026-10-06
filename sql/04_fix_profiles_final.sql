-- =============================================================
-- 04_fix_profiles_final.sql
-- À PROVA DE ERROS: detecta as colunas reais da tabela profiles,
-- adiciona o que faltar (nome), sincroniza perfis e promove admin.
-- Cole TODO este arquivo no SQL Editor do Supabase e clique Run.
-- =============================================================

-- 1) Garante que a tabela profiles existe
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  nome text,
  role text NOT NULL DEFAULT 'vendedor',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2) Se a coluna "nome" não existir, cria.
--    (Se existir com outro nome — ex.: full_name — renomeia em vez de duplicar.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles' AND column_name='nome') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='profiles' AND column_name='full_name') THEN
      ALTER TABLE public.profiles RENAME COLUMN full_name TO nome;
    ELSE
      ALTER TABLE public.profiles ADD COLUMN nome text DEFAULT '';
    END IF;
  END IF;
END $$;

-- 3) Remove TODAS as políticas antigas (qualquer versão anterior do script)
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='profiles'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- 4) Função auxiliar segura: diz se o usuário logado é administrador.
--    SECURITY DEFINER evita recursão de RLS dentro das próprias políticas.
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

-- 5) Políticas definitivas
--    Cada usuário autenticado pode ver/editar o PRÓPRIO perfil
CREATE POLICY profiles_self_select ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

--    Administradores têm acesso total
CREATE POLICY profiles_admin_all ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

--    Bootstrap: qualquer usuário autenticado pode criar o PRÓPRIO perfil,
--    mas só consegue papel 'administrador' enquanto a tabela estiver VAZIA.
CREATE POLICY profiles_insert_self ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND (
      coalesce(role,'vendedor') <> 'administrador'
      OR NOT EXISTS (SELECT 1 FROM public.profiles)
    )
  );

-- 6) Sincroniza PERFIS FALTANTES: cria uma linha em profiles para cada
--    usuário de auth.users sem perfil. O mais antigo vira administrador.
INSERT INTO public.profiles (id, email, nome, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'nome', ''),
  CASE WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'administrador')
       THEN 'administrador' ELSE 'vendedor' END
FROM auth.users u
WHERE u.id NOT IN (SELECT id FROM public.profiles)
ORDER BY u.created_at ASC
ON CONFLICT (id) DO NOTHING;

-- 7) Garantia final: se ainda não houver NENHUM administrador,
--    promove o perfil mais antigo.
UPDATE public.profiles SET role = 'administrador'
WHERE id = (SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1)
AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'administrador');

-- Pronto! Confira o resultado (deve mostrar seu e-mail com role = administrador):
SELECT id, email, nome, role, created_at FROM public.profiles ORDER BY created_at;
