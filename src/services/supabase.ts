import { createClient } from '@supabase/supabase-js';

const getEnvVar = (name: string) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name] || process.env[`VITE_${name}`];
  }
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    return import.meta.env[`VITE_${name}`] || import.meta.env[name];
  }
  return '';
};

const supabaseUrl = getEnvVar('SUPABASE_URL') || 'https://dpwkojtfeoxlpyevutfc.supabase.co';
const supabaseKey = getEnvVar('SUPABASE_KEY') || 'sb_publishable_WumEuqpPeooXrt1nkO9l_w_zWa37BgE';

// createClient doesn't crash on startup if strings are provided, even if invalid.
export const supabase = createClient(supabaseUrl, supabaseKey);
