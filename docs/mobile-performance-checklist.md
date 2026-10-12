# Checklist de validação mobile e performance

## 1) Validação manual em emulador ou celular real

Teste as telas principais em modo responsivo:
- 360x640
- 390x844
- 768x1024

Rotas a validar:
- `/login`
- `/dashboard`
- `/produtos`
- `/cadastros`
- `/pessoas`
- `/consignacoes`
- `/movimentacoes`
- `/usuarios`

Checklist:
- [ ] botões com altura mínima de 44px
- [ ] inputs grandes o suficiente para toque
- [ ] sem scroll horizontal em páginas de tabela
- [ ] textos legíveis sem zoom forçado
- [ ] mensagens de erro e sucesso visíveis
- [ ] navegação com `BackBar` simples e estável
- [ ] layout do dashboard se adapta sem quebrar logo no topo

## 2) Saúde de build

Commands:

```bash
npm install
npm run build
npm run preview -- --host 0.0.0.0
```

O que verificar:
- build final sem erros no console
- sem warnings críticos de dependências
- sem exceções em carregamento de rotas

## 3) Performance mobile

Rodar Lighthouse localmente em URL pública ou local:

```bash
npx lighthouse http://localhost:4173 --only-categories=performance,accessibility,best-practices,seo
```

Métricas principais:
- FCP
- LCP
- CLS
- TBT
- Performance geral

Resultados esperados:
- sem CLS alto em formulários
- LCP aceitável em carregamento inicial
- ausência de conteúdo bloqueante no carregamento do dashboard

## 4) Pontos de atenção

- manter layouts mobile-first
- reduzir uso de tabelas largas em telas pequenas
- priorizar componentes com toque fácil e contrastes altos
- revisar políticas RLS do Supabase antes do uso real
- manter `.env.local` fora do repositório

## 5) Próximos passos finais

- validar em aparelho real
- confirmar políticas RLS e autenticação em produção
- revisar acessibilidade e contraste
- preparar deploy final com monitoramento de performance
