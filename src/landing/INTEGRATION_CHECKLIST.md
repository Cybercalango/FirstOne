# Integração da landing — checklist e revisões

Este arquivo documenta as revisões que foram realizadas e os passos necessários antes do merge da branch `feature/integrar-landing-backup` para a branch `main`.

## 1) Resumo das mudanças
- Copiada e adaptada a landing page pública do backup `Work/` para `src/landing/`.
- Ajustado o token de cor `--gold` para `oklch(0.32 0.13 337)` por solicitação de design.
- Componentes principais: `src/landing/Landing.jsx`, `src/landing/catalog.js`, `src/landing/ui.jsx`, `src/landing/landing.css`.

## 2) Qualidade de código (observações)
- Arquivo `Landing.jsx` é extenso; sugerimos decompor em subcomponentes:
  - `Header` (logo, navegação)
  - `Catalog` (lista de produtos, filtros)
  - `ProductCard` (cartão do produto)
  - `ProductDialog` (detalhes em modal)
- Adicionar testes mínimo-viáveis:
  - Teste: `listProducts` com mock (carregamento/erro/vazio)
  - Teste: filtro por categoria e busca
  - Teste: abertura/fechamento do modal do produto

## 3) Riscos de segurança (itens encontrados e mitigação)
- Chaves/segredos: o projeto possui `src/supabaseClient.js` — confirmar que NÃO há chaves commitadas.
  - Mitigação: usar `src/landing/.env.example` e GitHub Secrets para CI.
- XSS: dados vindos do backend (nome, descrição) devem ser tratados/escapados no render.
  - Mitigação: validar/sanitizar no backend e escapar no frontend se houver HTML.
- Links externos (buyLink): já usa `rel="noreferrer"`, manter validação adicional se necessário.
- Dependências: executar `npm audit` e revisar vulnerabilidades críticas.

## 4) Compatibilidade visual
- A cor `--gold` foi ajustada; executar estas verificações:
  1. Verificar contraste entre botão (`--gold` / background) e texto (`--primary-foreground`) com ferramenta (ex.: Lighthouse / axe).
  2. Testar estados: hover, focus, active, disabled, tamanhos pequenos (mobile).
  3. Checar se `landing.css` não sobrescreve estilos críticos do dashboard ou login.

## 5) Testes e QA recomendados
- Executar:
  - `npm install`
  - `npm run dev` (verificar rota `/` — a landing está atribuída como `/` no App.jsx)
  - Testar filtros, busca, favoritos, modal de produto.
- Run Lighthouse: atalho no Chrome DevTools -> Lighthouse -> Accessibility + Performance
- Executar `npm run lint` e `npm run test` (se houver testes configurados)

## 6) Checklist pré-merge (marcar antes do merge)
- [ ] `npm run build` com sucesso
- [ ] `npm run lint` sem erros bloqueantes
- [ ] `npm audit` revisado (nenhuma vulnerabilidade crítica sem plano de mitigação)
- [ ] `.env.example` presente e sem segredos no repositório
- [ ] Testes manuais: filtros, busca, modal OK
- [ ] Relatório de contraste (Lighthouse/axe) anexado ao PR
- [ ] 1–2 aprovações de revisores (code review)

## 7) Plano de rollback
- Se houver regressão após merge, reverter o merge com:
  - `git revert -m 1 <merge-commit-sha>`

## 8) Notas para o revisor
- Priorize verificação de: integrações do `supabaseClient.js`, importações relativas quebradas, e regressões no dashboard/login.

---

Arquivo gerado automaticamente por Copilot para apoiar a revisão.