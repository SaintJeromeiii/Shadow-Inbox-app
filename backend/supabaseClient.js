const { createClient } = require('@supabase/supabase-js');

let client = null;

function isSupabaseEnabled() {
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY),
  );
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  if (!client) {
    const usingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!usingServiceRole) {
      console.warn(
        '[Supabase] SUPABASE_SERVICE_ROLE_KEY is missing — using anon key. Writes may fail RLS checks.',
      );
    }
    client = createClient(process.env.SUPABASE_URL, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return client;
}

module.exports = {
  getSupabase,
  isSupabaseEnabled,
};
