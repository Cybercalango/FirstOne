# Secrets do GitHub Actions

O workflow `.github/workflows/build.yml` compila o site a cada push em `main` e `mobile/improvements`.

Para funcionar, crie dois Secrets no repositório (Settings -> Secrets and variables -> Actions -> New repository secret):

- VITE_SUPABASE_URL = https://dgbkmgarvnxsomtsrawd.supabase.co
- VITE_SUPABASE_ANON_KEY = (sua chave publishable/anon do painel do Supabase)

Nunca commite chaves no codigo. Use sempre Secrets / variaveis de ambiente.
