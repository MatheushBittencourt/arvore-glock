import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[Supabase] Variáveis de ambiente ausentes.\n' +
    'Defina VITE_SUPABASE_URL e VITE_SUPABASE_KEY no painel da Vercel (Settings → Environment Variables).'
  )
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null
