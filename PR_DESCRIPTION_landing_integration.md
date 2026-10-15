# PR: Integrar landing page (backup Work) — sandbox -> main

## Título proposto
feat(landing): integrar landing pública e catálogo (sandbox)

## Descrição (copiar para o corpo do PR)
**O que**: Adiciona a landing pública e o catálogo extraídos do backup Work para o projeto principal. A mudança é implementada em sandbox em `src/landing/` e assets relacionados.

**Por que**: Permitir integração iterativa e revisão sem impactar funcionalidades internas (login, dashboard).

**Arquivos-chave adicionados/atualizados**:
- src/landing/Landing.jsx
- src/landing/catalog.js
- src/landing/ui.jsx
- src/landing/landing.css (inclui alteração de --gold para oklch(0.32 0.13 337))
- src/landing/assets/*
- src/landing/.env.example
- src/landing/INTEGRATION_CHECKLIST.md

**Como testar localmente**:
1. git checkout feature/integrar-landing-backup
2. npm install
3. npm run dev
4. Abrir http://localhost:5173/ (a landing está registrada na rota `/`)

**Variáveis de ambiente**:
- Ver `src/landing/.env.example` — crie um `.env` local com as chaves de dev necessárias (não comitar)

**Checklist para o PR**:
- [ ] Build (`npm run build`) passa
- [ ] Lint sem erros bloqueantes
- [ ] Testes (se aplicáveis) passam
- [ ] Auditoria de segurança (npm audit) revisada
- [ ] Contraste/Accessibility (Lighthouse/axe) verificado
- [ ] 1–2 revisores aprovaram

**Notas**:
- O estudante implementou a integração de forma funcional; recomenda-se decompor `Landing.jsx` em subcomponentes e adicionar testes antes do merge final em produção.

