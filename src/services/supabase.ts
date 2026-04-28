import { createClient } from '@supabase/supabase-js';

const getEnv = (key: string, fallback: string) => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    // @ts-ignore
    return import.meta.env[key];
  }
  return fallback;
};

const supabaseUrl = getEnv('SUPABASE_URL', getEnv('VITE_SUPABASE_URL', 'https://dpwkojtfeoxlpyevutfc.supabase.co')) || 'https://dpwkojtfeoxlpyevutfc.supabase.co';
const supabaseKey = getEnv('SUPABASE_KEY', getEnv('VITE_SUPABASE_KEY', 'sb_publishable_WumEuqpPeooXrt1nkO9l_w_zWa37BgE')) || 'sb_publishable_WumEuqpPeooXrt1nkO9l_w_zWa37BgE';

// createClient doesn't crash on startup if strings are provided, even if invalid.
export const supabase = createClient(supabaseUrl, supabaseKey);
