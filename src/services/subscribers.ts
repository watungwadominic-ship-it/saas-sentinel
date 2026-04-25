import { supabase } from './supabase';
import { Subscriber } from '../types';

export async function addSubscriber(email: string): Promise<{ success: boolean; error?: string; alreadyExists?: boolean }> {
  const { error } = await supabase
    .from('subscribers')
    .insert([
      { 
        email: email,
        created_at: new Date().toISOString()
      }
    ]);

  if (error) {
    // Check if error is due to unique constraint violation
    if (error.code === '23505') {
      return { success: false, alreadyExists: true };
    }
    console.error('Error adding subscriber:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
