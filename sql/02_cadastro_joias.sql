-- ============================================================
-- Script 02: Cadastros de Joias, Variantes, Tipos, Grades e Clientes/Vendedores
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- ============================================================

-- 1. VARIANTES DE BANHO/MATERIAL (ouro, rhódio, prata, aço...)
CREATE TABLE IF NOT EXISTS variants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TIPOS DE JOIA (anel, pulseira, cordão...)
CREATE TABLE IF NOT EXISTS types (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. GRADES DE TAMANHO (ex.: Grade Anéis Femininos)
CREATE TABLE IF NOT EXISTS size_grids (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. TAMANHOS DENTRO DE CADA GRADE (ex.: 10, 12, 14...)
CREATE TABLE IF NOT EXISTS grid_sizes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grid_id BIGINT NOT NULL REFERENCES size_grids(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  UNIQUE (grid_id, size)
);

-- 5. PESSOAS (clientes e vendedores autônomos em consignação)
CREATE TABLE IF NOT EXISTS people (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  cpf_cnpj TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_client BOOLEAN NOT NULL DEFAULT true,
  is_consignor BOOLEAN NOT NULL DEFAULT false, -- vendedor/parceiro que recebe peças em consignação
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. MODELOS DE PRODUTO (a joia em si: nome + tipo + grade padrão)
CREATE TABLE IF NOT EXISTS models (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  type_id BIGINT REFERENCES types(id),
  default_grid_id BIGINT REFERENCES size_grids(id),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. ITENS DE ESTOQUE (uma peça concreta: modelo + variante + tamanho)
CREATE TABLE IF NOT EXISTS items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barcode TEXT UNIQUE,
  model_id BIGINT REFERENCES models(id),
  variant_id BIGINT REFERENCES variants(id),
  size TEXT,
  price_cost NUMERIC(12,2) DEFAULT 0,
  price_sale NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'estoque',   -- estoque | consignacao | vendido
  owner_type TEXT NOT NULL DEFAULT 'loja',  -- loja | pessoa
  owner_id BIGINT,                          -- se pessoa: id em people
  acquisition_date DATE,                    -- quando o item foi adquirido
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registros padrão de exemplo (só inserem se ainda não existirem)
INSERT INTO variants (name) VALUES ('Ouro'), ('Rhódio'), ('Prata'), ('Aço')
ON CONFLICT (name) DO NOTHING;

INSERT INTO types (name) VALUES ('Anel'), ('Pulseira'), ('Cordão'), ('Brinco'), ('Pingente'), ('Tornozeleira'), ('Bersat')
ON CONFLICT (name) DO NOTHING;

-- Habilitar RLS com permissão total para usuários autenticados
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['variants','types','size_grids','grid_sizes','people','models','items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'auth_all') THEN
      EXECUTE format('CREATE POLICY auth_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
