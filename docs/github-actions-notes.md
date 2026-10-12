# Segredos do GitHub Actions (obrigatório)

O workflow `.github/workflows/build.yml` compila o site a cada push em `main` ou `mobile/improvements`.
Antes de funcionar com as chaves corretas, adicione os secrets manualmente:

1. Abra: https://github.com/Cybercalango/FirstOne/settings/secrets/actions
2. New repository secret:
   - `VITE_SUPABASE_URL` = `https://dgbkmgarvnxsomtsrawd.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = sua chave anon/publishable do Supabase
     (Project Settings -> API Keys). Rotacione a chave se ela foi exposta em chat.
3. Todo build no Actions passa a incorporar as variáveis automaticamente.

## Testar localmente
```bash
npm ci
cp .env.example .env.local   # edite com suas chaves
npm run dev                  # desenvolvimento
npm run build                # gera dist/
npm run preview -- --host 0.0.0.0   # celular: http://SEU_IP:4173
```
