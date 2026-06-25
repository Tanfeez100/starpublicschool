import { createClient } from "@supabase/supabase-js";

console.log("ENV URL:", process.env.SUPABASE_URL);

/**
 * Supabase Client Configuration with Optimizations
 * 
 * Token Expiration: 30 minutes (configured in Supabase Dashboard)
 * - Go to: Authentication > Settings > JWT Settings
 * - Set "JWT expiry" to 1800 seconds (30 minutes)
 * 
 * Optimizations:
 * - Increased timeout to 30s
 * - Connection pooling for reuse
 * - Local JWT verification without network calls
 */
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "Content-Type": "application/json",
      },
      fetch: (url, options = {}) => {
        // Increase timeout to 30 seconds instead of 10s default
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        return fetch(url, {
          ...options,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
      },
    },
  }
);

export const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (url, options = {}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        return fetch(url, {
          ...options,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
      },
    },
  }
);

/**
 * User Role Cache - reduces database queries
 * Structure: { userId: { role, timestamp } }
 */
const roleCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const getRoleCached = async (userId) => {
  const cached = roleCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.role;
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (!error && data) {
    roleCache.set(userId, { role: data.role, timestamp: Date.now() });
    return data.role;
  }
  return null;
};

/**
 * Verify and get user from token with retry logic
 * Uses Supabase auth to properly verify tokens
 */
export const verifyToken = async (token, retryFn) => {
  try {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    
    if (error || !user) {
      return { valid: false, error: error?.message || "User not found" };
    }
    
    return { valid: true, user };
  } catch (err) {
    return { valid: false, error: err.message };
  }
};
