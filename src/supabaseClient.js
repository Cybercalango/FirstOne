import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dgbkmgarvnxsomtsrawd.supabase.co'
// Atenção: a chave usada DEVE ser a "anon public" do Supabase (token JWT longo, começa com eyJ...).
// Configure VITE_SUPABASE_ANON_KEY nas variáveis de ambiente do Cloudflare (Settings > Environment variables).
// Fallback: usa a publishable key do projeto se a env não estiver no build local
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_9nFvsDzZUHztLqtsHKgZzQ_I85WgKfM'
if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Usando chave embutida (fallback). Prefira definir VITE_SUPABASE_ANON_KEY no Cloudflare.')
}

export const supabase = createClient(SUPABASE_URL, supabaseAnonKey)
