# Lista de arquivos portados da landing (Work/) — Bloco 2

## Imprescindíveis (já copiados/convertidos)
- Work/src/routes/index.tsx  -> src/landing/Landing.jsx (rota "/" do app principal)
- Work/src/styles.css        -> src/landing/landing.css (escopado em .landing-root, sem Tailwind)
- Work/src/assets/*.jpg|png  -> src/landing/assets/ (logo, fotos hero/produtos)
- Work/src/lib/catalog.ts    -> src/landing/catalog.js (formatPrice + categorias)
- Primitivos Button/Dialog   -> src/landing/ui.jsx (substitui Radix/Tailwind)

## Adaptados (dados)
- Work/src/lib/products.functions.ts (server fns TanStack + Supabase do projeto antigo "iuuqlbbcemhthircjwkf")
  -> src/landing/catalog.js lendo a tabela `items` do NOSSO projeto (dgbkmgarvnxsomtsrawd), colunas novas via sql/20_catalogo_publico.sql

## NÃO portados (dispensados na integração direta)
- Work/src/router.tsx, routeTree.gen.ts, server.ts, start.ts (TanStack Start — substituído pelo react-router-dom existente)
- Work/src/components/ui/* (Radix+Tailwind — trocados por ui.jsx enxuto)
- Work/src/integrations/supabase/* (aponta para outro projeto; usamos src/supabaseClient.js)
- Work/drizzle/* (migrações do banco antigo; reescritas como sql/20_catalogo_publico.sql)
- configs bun/eslint/prettier/drizzle do backup

## Opcionais (fase 2)
- Tela admin do catálogo (Work/src/routes/_authenticated/admin.tsx) — edição de name/photo/published
- Upload de fotos para o bucket publico 'catalogo'
