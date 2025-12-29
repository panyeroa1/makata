/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

export const updateUserProfile = async (updates: {
  display_name?: string;
  avatar_url?: string;
  settings?: any;
}) => {
  const { error } = await supabase.auth.updateUser({
    data: updates
  });
  if (error) throw error;
};

export const getUserProfile = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user?.user_metadata;
};

export const ensureGuestSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    return session.user;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;

  return data.user;
};
