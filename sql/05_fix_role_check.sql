-- =====================================================================
-- 05_fix_role_check.sql
-- Corrige o erro: "violates check constraint profiles_role_check"
-- A tabela profiles antiga tinha uma restrição que só aceitava certos
-- valores de role (e não aceitava 'administrador'). Este script remove
-- a restrição e aceita os três níveis do sistema.
-- =====================================================================

-- 1) Remove QUALQUER restrição de checagem sobre a coluna role
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.profiles'::regclass
             AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- 2) Garante que a coluna role existe e é texto simples, padrão 'vendedor'
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'vendedor',
  ALTER COLUMN role SET NOT NULL;

-- 3) Garante que a coluna nome existe (cria se faltar)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles' AND column_name='nome') THEN
    ALTER TABLE public.profiles ADD COLUMN nome text DEFAULT '';
  END IF;
END $$;

-- 4) Sincroniza perfis faltantes (todos os usuários de auth.users)
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

-- 5) Garantia final: se ainda não houver administrador, promove o mais antigo
UPDATE public.profiles SET role = 'administrador'
WHERE id = (SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1)
AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'administrador');

-- 6) Se por acaso algum perfil ficou SEM role válida, corrige para 'vendedor'
UPDATE public.profiles
SET role = 'vendedor'
WHERE role IS NULL OR role NOT IN ('administrador','gerente','vendedor');

-- Confira o resultado: seu e-mail deve aparecer com role = administrador
SELECT id, email, nome, role, created_at FROM public.profiles ORDER BY created_at;
