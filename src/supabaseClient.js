import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dgbkmgarvnxsomtsrawd.supabase.co'
const supabaseAnonKey = 'sb_publishable_9nFvsDzZUHztLqtsHKgZzQ_I85WgKfM'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
