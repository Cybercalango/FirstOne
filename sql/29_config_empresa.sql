-- =====================================================================
-- 29_config_empresa.sql
-- Dados da empresa usados nas impressões (romaneio timbrado, etiquetas).
-- Tabela-chave/valor com linha única id=1 e defaults "Flor da Pele".
-- Idempotente: INSERT ... ON CONFLICT DO NOTHING (não sobrescreve edits).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.company_settings (
  id            INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome          TEXT NOT NULL DEFAULT 'Flor da Pele',
  slogan        TEXT NOT NULL DEFAULT 'Joias Folheadas',
  telefone      TEXT,
  whatsapp      TEXT,
  email         TEXT,
  site          TEXT,
  instagram     TEXT,
  endereco      TEXT,
  cidade_uf     TEXT,
  cep           TEXT,
  cnpj          TEXT,
  logo_url      TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.company_settings (id, nome, slogan)
VALUES (1, 'Flor da Pele', 'Joias Folheadas')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_select_all ON public.company_settings;
CREATE POLICY company_select_all ON public.company_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS company_update_auth ON public.company_settings;
CREATE POLICY company_update_auth ON public.company_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS company_insert_auth ON public.company_settings;
CREATE POLICY company_insert_auth ON public.company_settings FOR INSERT
  TO authenticated WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
