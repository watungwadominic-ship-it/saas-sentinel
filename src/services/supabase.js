import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dpwkojtfeoxlpyevutfc.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_WumEuqpPeooXrt1nkO9l_w_zWa37BgE';

export const supabase = createClient(supabaseUrl, supabaseKey);
