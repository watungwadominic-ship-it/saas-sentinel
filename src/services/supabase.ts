import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || 'https://dpwkojtfeoxlpyevutfc.supabase.co';
const supabaseKey = (import.meta as any).env.VITE_SUPABASE_KEY || 'sb_publishable_WumEuqpPeooXrt1nkO9l_w_zWa37BgE';

// createClient doesn't crash on startup if strings are provided, even if invalid.
export const supabase = createClient(supabaseUrl, supabaseKey);
