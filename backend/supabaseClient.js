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
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
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
