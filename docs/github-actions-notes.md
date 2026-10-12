# Segredos do GitHub Actions (obrigatório)

O workflow `.github/workflows/build.yml` compila o site a cada push em `main` ou `mobile/improvements`.
Para que use as chaves corretas do Supabase, adicione os secrets manualmente (a API do GitHub não permite criá-los sem permissão de `admin:repo_hook`, e nunca se deve colocar chaves em commits):

1. Abra: https://github.com/Cybercalango/FirstOne/settings/secrets/actions
2. Clique em **New repository secret** e crie:
   - `VITE_SUPABASE_URL` = `https://dgbkmgarvnxsomtsrawd.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = sua chave anon/publishable do Supabase
     (painel Supabase → Project Settings → API Keys → *anon public* / *publishable*)
3. Após salvar, todo novo build no Actions já incorpora as variáveis.

Observação: como o código tem fallback embutido com esses mesmos valores, o build funciona mesmo sem os secrets — mas para rotacionar a chave (recomendado, pois ela foi compartilhada em chat), configure os secrets e atualize também o valor de fallback ou remova-o.

## Testar localmente
```bash
npm ci
cp .env.example .env.local   # edite com suas chaves
npm run dev                  # desenvolvimento (http://localhost:5173)
npm run build                # gera dist/
npm run preview -- --host 0.0.0.0   # teste no celular: http://SEU_IP:4173
```
