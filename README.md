# FirstOne

Aplicação web para gestão de joias, estoque, pessoas, consignações e movimentações internas, construída com React + Vite + Supabase.

## Visão geral

O projeto gerencia:
- cadastro de produtos e modelos
- cadastro de pessoas (clientes, vendedores, consignatários)
- consignações
- movimentações de entrada/saída de estoque
- autenticação por perfil (administrador, gerente, vendedor)

## Stack

- React 19
- Vite 8
- Supabase JS
- SQL para estrutura/roles/policies

## Pré-requisitos

- Node.js 18+
- npm
- um projeto Supabase com URL e anon key válidos

## Configuração local

1. Clone o projeto
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Crie um arquivo `.env.local` a partir do exemplo:
   ```bash
   cp .env.example .env.local
   ```
4. Preencha as variáveis do Supabase:
   ```env
   VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=SEU_ANON_KEY
   ```
5. Inicie o projeto:
   ```bash
   npm run dev
   ```

## Scripts disponíveis

```bash
npm run dev      # inicia o ambiente de desenvolvimento
npm run build    # gera build de produção
npm run preview  # visualiza o build localmente
npm run lint     # valida com oxlint
```

## Estrutura do projeto

```text
public/          arquivos públicos e assets estáticos
sql/             scripts SQL de criação e correção de estrutura
src/
  components/    componentes reutilizáveis
  pages/         telas do sistema
  App.jsx        roteamento principal
  Dashboard.jsx  painel principal
  Login.jsx      autenticação e criação de conta
  supabaseClient.js  cliente Supabase
index.html       entrada do Vite
```

## Banco de dados e autenticação

Os scripts em `sql/` foram utilizados para configurar:
- perfis
- políticas de acesso
- tipos e modelos de produtos
- consignações e movimentações
- pessoas e endereços

Importante:
- Nunca commite chaves reais no repositório.
- Sempre utilize `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` via ambiente local ou do deploy.
- As políticas RLS do Supabase devem ser revisadas antes de abrir o sistema para uso real.

## Fluxo do sistema

1. A tela de login cria ou valida o usuário no Supabase.
2. O perfil do usuário é lido em `profiles` e define a permissão.
3. O dashboard habilita módulos conforme o perfil do usuário.
4. As páginas de cadastro e gestão acessam os dados no Supabase.

## Observações importantes

- O projeto ainda está em evolução e algumas partes do banco foram ajustadas por scripts de correção.
- A parte visual mobile foi melhorada, mas vale verificar em dispositivos reais antes de produção.
- Acompanhe também a documentação interna em `docs/mobile-progress.md` para o estado atual das melhorias responsivas.

## Próximos passos recomendados

- revisar regras de segurança no Supabase
- validar telas em dispositivo real
- testar Lighthouse mobile
- consolidar a documentação final para uso operacional
