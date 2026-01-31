import { createClient } from "@supabase/supabase-js";

console.log("ENV URL:", process.env.SUPABASE_URL);

/**
 * Supabase Client Configuration
 * 
 * Token Expiration: 30 minutes (configured in Supabase Dashboard)
 * - Go to: Authentication > Settings > JWT Settings
 * - Set "JWT expiry" to 1800 seconds (30 minutes)
 * 
 * Note: Frontend should track user activity (mouse movement, clicks, etc.)
 * and refresh token before expiration to maintain session.
 */
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: false, // Server-side doesn't persist sessions
      detectSessionInUrl: false,
    },
  }
);
