-- =====================================================================
-- 11_pessoas_endereco.sql
-- Adiciona ao cadastro de pessoas os campos universais de endereço
-- (CEP, logradouro, número, complemento, bairro, cidade, UF) e data
-- de nascimento. Idempotente: pode ser executado mais de uma vez.
-- =====================================================================

ALTER TABLE public.people ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS zip text;          -- CEP
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS street text;       -- logradouro
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS number text;       -- número
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS complement text;   -- complemento
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS district text;     -- bairro
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS city text;         -- cidade
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS state text;        -- UF

-- Mantém o campo "address" legível para registros antigos:
UPDATE public.people
SET address = 'Endereço antigo (sem detalhamento)'
WHERE address IS NULL OR address = '';

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='people'
ORDER BY ordinal_position;
