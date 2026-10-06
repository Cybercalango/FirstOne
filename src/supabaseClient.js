import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://dgbkmgarvnxsomtsrawd.supabase.co'
// Atenção: a chave usada DEVE ser a "anon public" do Supabase (token JWT longo, começa com eyJ...).
// Configure VITE_SUPABASE_ANON_KEY nas variáveis de ambiente do Cloudflare (Settings > Environment variables).
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!supabaseAnonKey) {
  console.error('[Supabase] A variável VITE_SUPABASE_ANON_KEY não está definida. Configure-a no Cloudflare.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
