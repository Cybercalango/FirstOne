-- =====================================================================
-- 10_verificar_e_corrigir_tudo.sql
-- DIAGNÓSTICO + REPARO AUTOMÁTICO — rode UMA VEZ no SQL Editor.
-- Funciona em QUALQUER estado do banco: tabelas faltando, nomes
-- antigos (profiles/products/customers), políticas quebradas, etc.
-- Não gera erro se algo já existe; cria/repara o que falta.
-- =====================================================================

-- ---------------------------------------------------------------
-- PASSO 1: TABELA profiles (login/permissões) — nome canônico
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  nome text DEFAULT '',
  role text NOT NULL DEFAULT 'vendedor',
  created_at timestamptz DEFAULT now()
);

-- Função auxiliar: verifica se uma coluna existe em uma tabela
CREATE OR REPLACE FUNCTION public.exists_col(tbl TEXT, col TEXT)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name=tbl AND column_name=col);
$$;

-- Se existir uma tabela legada de perfis com OUTRO nome
-- (ex.: user_profiles), copia os usuários dela para profiles.
DO $$
DECLARE legacy TEXT;
BEGIN
  FOREACH legacy IN ARRAY ARRAY['user_profiles','perfil','perfil_usuario']
  LOOP
    IF to_regclass('public.'||legacy) IS NOT NULL THEN
      EXECUTE format(
        'INSERT INTO public.profiles (id, email, nome, role)
         SELECT id,
                COALESCE(%s, ''''),
                COALESCE(%s, ''''),
                CASE WHEN lower(COALESCE(%s, %s, '''')) LIKE ''%%admin%%''
                     THEN ''administrador''
                     WHEN lower(COALESCE(%s, %s, '''')) = ''gerente''
                     THEN ''gerente'' ELSE ''vendedor'' END
         FROM public.%I
         WHERE id NOT IN (SELECT id FROM public.profiles)
         ON CONFLICT (id) DO NOTHING',
        CASE WHEN exists_col(legacy,'email')   THEN 'email'          ELSE 'NULL' END,
        CASE WHEN exists_col(legacy,'nome')    THEN 'nome'
             WHEN exists_col(legacy,'full_name') THEN 'full_name'     ELSE 'NULL' END,
        CASE WHEN exists_col(legacy,'role')    THEN 'role'           ELSE 'NULL' END,
        CASE WHEN exists_col(legacy,'admin_role') THEN 'admin_role'  ELSE 'NULL' END,
        CASE WHEN exists_col(legacy,'role')    THEN 'role'           ELSE 'NULL' END,
        CASE WHEN exists_col(legacy,'admin_role') THEN 'admin_role'  ELSE 'NULL' END,
        legacy);
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Remove qualquer CHECK antigo que proíba 'administrador'
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid='public.profiles'::regclass AND contype='c'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- Garante colunas mínimas
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome  text DEFAULT '';
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'vendedor';

-- Cria perfil para TODO usuário de auth.users sem perfil;
-- se não houver administrador, o mais antigo vira administrador.
INSERT INTO public.profiles (id, email, nome, role)
SELECT u.id,
       u.email,
       COALESCE(u.raw_user_meta_data->>'nome',''),
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE role='administrador')
            THEN 'administrador' ELSE 'vendedor' END
FROM auth.users u
WHERE u.id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles SET role='administrador'
WHERE id = (SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1)
AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE role='administrador');

-- Normaliza roles inválidas
UPDATE public.profiles
SET role='vendedor'
WHERE role IS NULL OR role NOT IN ('administrador','gerente','vendedor');

-- Função is_admin (SECURITY DEFINER evita recursão de RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = auth.uid() AND role='administrador');
$$;

-- Políticas da profiles: todos leem, dono edita o próprio (sem se promover),
-- admin faz tudo, bootstrap do primeiro admin permitido.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='profiles'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY profiles_select_all ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid()=id)
  WITH CHECK (auth.uid()=id AND (role='vendedor' OR public.is_admin()));
CREATE POLICY profiles_admin_all ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY profiles_bootstrap ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()=id AND (coalesce(role,'vendedor')<>'administrador'
              OR NOT EXISTS (SELECT 1 FROM public.profiles)));

-- ---------------------------------------------------------------
-- PASSO 2: ALIANças de compatibilidade (views) — se existirem
-- tabelas legadas com outros nomes, o app continua funcionando.
-- (Produtos legados 'products' viram 'items' via view apenas se
--  'items' NÃO existir ainda; caso contrário nada é feito.)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.items') IS NULL AND to_regclass('public.products') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.products RENAME TO items';
  END IF;
  IF to_regclass('public.people') IS NULL AND to_regclass('public.customers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.customers RENAME TO people';
  END IF;
END $$;

-- ---------------------------------------------------------------
-- PASSO 3: TABELAS BASE (cria as que faltam, mantém as existentes)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.variants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS public.types (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS public.size_grids (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, description TEXT,
  created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS public.grid_sizes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grid_id BIGINT NOT NULL REFERENCES public.size_grids(id) ON DELETE CASCADE,
  size TEXT NOT NULL, UNIQUE(grid_id,size));

CREATE TABLE IF NOT EXISTS public.people (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL, cpf_cnpj TEXT, phone TEXT, email TEXT, address TEXT,
  notes TEXT, is_client BOOLEAN NOT NULL DEFAULT true,
  is_consignor BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS public.models (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL, type_id BIGINT REFERENCES public.types(id),
  default_grid_id BIGINT REFERENCES public.size_grids(id),
  description TEXT, created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS public.items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barcode TEXT UNIQUE, model_id BIGINT REFERENCES public.models(id),
  variant_id BIGINT REFERENCES public.variants(id), size TEXT,
  price_cost NUMERIC(12,2) DEFAULT 0, price_sale NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'estoque',
  owner_type TEXT NOT NULL DEFAULT 'loja', owner_id BIGINT,
  acquisition_date DATE, notes TEXT, created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS public.item_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL, reason TEXT DEFAULT '',
  user_id UUID DEFAULT auth.uid(), created_at TIMESTAMPTZ DEFAULT now());

INSERT INTO public.variants(name) VALUES ('Ouro'),('Rhódio'),('Prata'),('Aço')
ON CONFLICT (name) DO NOTHING;
INSERT INTO public.types(name)
VALUES ('Anel'),('Pulseira'),('Cordão'),('Brinco'),('Pingente'),('Tornozeleira'),('Bersat')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------
-- PASSO 4: CONSIGNAÇÕES + MOVIMENTAÇÕES
-- Só recria se estiverem FALTANDO ou QUEBRADAS (ex.: stock_movements
-- sumiu depois de um script parcial). Se já existem e íntegras,
-- mantém como estão.
-- ---------------------------------------------------------------
DO $$
DECLARE need BOOLEAN;
BEGIN
  need := (to_regclass('public.consignments') IS NULL)
       OR (to_regclass('public.consignment_items') IS NULL)
       OR (to_regclass('public.consignment_status_history') IS NULL)
       OR (to_regclass('public.stock_movements') IS NULL);
  IF need THEN
    -- limpa resquícios pela metade
    BEGIN EXECUTE 'DROP TRIGGER IF EXISTS trg_apply_stock_movement ON public.stock_movements';    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'DROP TRIGGER IF EXISTS trg_consignment_status  ON public.consignments';        EXCEPTION WHEN OTHERS THEN NULL; END;
    DROP TABLE IF EXISTS public.consignment_items;
    DROP TABLE IF EXISTS public.consignment_status_history;
    DROP TABLE IF EXISTS public.consignments;
    DROP TABLE IF EXISTS public.stock_movements;

    EXECUTE $f$CREATE TABLE public.consignments (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      consignor_id BIGINT,
      start_date DATE NOT NULL DEFAULT CURRENT_DATE,
      due_date DATE, end_date DATE,
      status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','encerrada','cancelada')),
      notes TEXT DEFAULT '', user_id UUID DEFAULT auth.uid(),
      created_at TIMESTAMPTZ DEFAULT now())$f$;

    EXECUTE $f$CREATE TABLE public.consignment_items (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      consignment_id BIGINT NOT NULL REFERENCES public.consignments(id) ON DELETE CASCADE,
      item_id BIGINT NOT NULL,
      returned BOOLEAN NOT NULL DEFAULT FALSE,
      sold BOOLEAN NOT NULL DEFAULT FALSE,
      sold_at TIMESTAMPTZ, returned_at TIMESTAMPTZ,
      notes TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT now())$f$;

    EXECUTE $f$CREATE TABLE public.consignment_status_history (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      consignment_id BIGINT NOT NULL REFERENCES public.consignments(id) ON DELETE CASCADE,
      old_status TEXT, new_status TEXT NOT NULL,
      changed_by UUID DEFAULT auth.uid(), changed_at TIMESTAMPTZ DEFAULT now(),
      notes TEXT DEFAULT '')$f$;

    EXECUTE $f$CREATE TABLE public.stock_movements (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      item_id BIGINT NOT NULL, person_id BIGINT,
      movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada','saida')),
      reason TEXT NOT NULL DEFAULT 'outro'
        CHECK (reason IN ('compra','producao','ajuste','venda','consignacao',
                          'devolucao_consignacao','quebra','perda','transferencia','outro')),
      reference TEXT DEFAULT '', notes TEXT DEFAULT '',
      user_id UUID DEFAULT auth.uid(), created_at TIMESTAMPTZ DEFAULT now())$f$;
  END IF;
END $$;

-- Índices (idempotentes)
CREATE INDEX IF NOT EXISTS idx_consignments_consignor ON public.consignments(consignor_id);
CREATE INDEX IF NOT EXISTS idx_consitems_consignment  ON public.consignment_items(consignment_id);
CREATE INDEX IF NOT EXISTS idx_consitems_item         ON public.consignment_items(item_id);
CREATE INDEX IF NOT EXISTS idx_movements_item         ON public.stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_movements_created      ON public.stock_movements(created_at DESC);

-- Funções/gatilhos (recria sempre — são idempotentes)
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from TEXT;
BEGIN
  BEGIN
    SELECT status INTO v_from FROM public.items WHERE id = NEW.item_id FOR UPDATE;
    IF NEW.movement_type = 'saida' THEN
      UPDATE public.items SET status='consignacao' WHERE id = NEW.item_id;
      INSERT INTO public.item_status_history (item_id, from_status, to_status, reason, user_id)
      VALUES (NEW.item_id, v_from, 'consignacao', COALESCE(NEW.reason,'saida'), NEW.user_id);
    ELSE
      UPDATE public.items SET status='estoque' WHERE id = NEW.item_id;
      INSERT INTO public.item_status_history (item_id, from_status, to_status, reason, user_id)
      VALUES (NEW.item_id, v_from, 'estoque', COALESCE(NEW.reason,'entrada'), NEW.user_id);
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_stock_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_stock_movement
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

CREATE OR REPLACE FUNCTION public.log_consignment_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.consignment_status_history
      (consignment_id, old_status, new_status, changed_by, notes)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), 'Alteração via sistema');
    IF NEW.status IN ('encerrada','cancelada') THEN NEW.end_date := CURRENT_DATE; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_consignment_status ON public.consignments;
CREATE TRIGGER trg_consignment_status
  BEFORE UPDATE ON public.consignments
  FOR EACH ROW EXECUTE FUNCTION public.log_consignment_status();

-- ---------------------------------------------------------------
-- PASSO 5: RLS para todas as tabelas operacionais
-- ---------------------------------------------------------------
DO $$
DECLARE t TEXT; pol RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'variants','types','size_grids','grid_sizes','people','models',
    'items','item_status_history',
    'consignments','consignment_items','consignment_status_history','stock_movements']
  LOOP
    CONTINUE WHEN to_regclass('public.'||t) IS NULL;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE schemaname='public' AND tablename=t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY "%s_read" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_write" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- PASSO 6: RELATÓRIO FINAL DE VERIFICAÇÃO
-- ---------------------------------------------------------------
SELECT 'tabelas' AS item, string_agg(tablename, ', ' ORDER BY tablename) AS resultado
FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('profiles','variants','types','size_grids','grid_sizes','people',
                    'models','items','item_status_history','consignments',
                    'consignment_items','consignment_status_history','stock_movements')
UNION ALL
SELECT 'usuarios sem perfil', count(*)::text
FROM auth.users u WHERE u.id NOT IN (SELECT id FROM public.profiles)
UNION ALL
SELECT 'administradores', count(*)::text || ' -> ' ||
       string_agg(email, ', ') FROM public.profiles WHERE role='administrador'
UNION ALL
SELECT 'função is_admin()', CASE WHEN to_regprocedure('public.is_admin()') IS NOT NULL
                                 THEN 'OK' ELSE 'FALTANDO' END;
