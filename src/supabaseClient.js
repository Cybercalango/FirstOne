import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] Variáveis ausentes: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local (ou no ambiente do deploy).'
  )
}

export const supabase = createClient(SUPABASE_URL, supabaseAnonKey)
