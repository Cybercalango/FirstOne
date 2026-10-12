import { createClient } from '@supabase/supabase-js'

// Valores padrão do projeto — usados quando as variáveis de ambiente não
// estão presentes (ex.: build do CI sem secrets configurados).
// Podem ser sobrescritos por VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://dgbkmgarvnxsomtsrawd.supabase.co'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_9nFvsDzZUHztLqtsHKgZzQ_I85WgKfM'

if (!SUPABASE_URL || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] Variáveis ausentes: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local (ou no ambiente do deploy).'
  )
}

export const supabase = createClient(SUPABASE_URL, supabaseAnonKey)
