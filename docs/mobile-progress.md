# Bloco 4 — status

Status: concluído

Resumo:
- Removi o uso de chave pública embutida do cliente Supabase.
- Passei a exigir que as variáveis de ambiente sejam fornecidas explicitamente.
- Criei um arquivo `.env.example` para documentação do setup.
- Atualizei o `README.md` para refletir o projeto real em vez do template Vite.

Arquivos alterados:
- `src/supabaseClient.js`
- `README.md`
- `.env.example`

Ponto de pausa:
- O app está em estado seguro para continuar, mas ainda requer configuração real do Supabase no ambiente de execução.
- Próximo bloco recomendado: testes de mobilidade real e revisão de performance.

Observação:
- Não foi incluída nenhuma chave real nem segredo. A aplicação agora exige configuração explícita via ambiente.
