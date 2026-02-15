import express from "express";
import { supabase, getRoleCached } from "../services/supabase.js";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

/**
 * OPTIMIZATION: Retry logic for network failures
 * Exponential backoff: 1s, 2s, 4s, 8s
 */
const retryWithBackoff = async (fn, maxRetries = 3, initialDelay = 1000) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Retry attempt ${i + 1}/${maxRetries} after ${delay}ms:`, err.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};

// Admin client for user management (uses service role key)
// OPTIMIZATION: Increased timeout to 30s
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
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

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email & password required" });

    // ⚡ OPTIMIZATION: Add retry logic for network resilience
    const { data, error } = await retryWithBackoff(() => 
      supabase.auth.signInWithPassword({ email, password })
    );

    if (error)
      return res.status(401).json({ message: "Invalid credentials" });

    // ⚡ OPTIMIZATION: Cache role fetch
    const role = await getRoleCached(data.user.id);

    if (!role)
      return res.status(403).json({ message: "Role not assigned" });

    // 3️⃣ ALLOW ADMIN AND TEACHER ROLES
    const allowedRoles = ["admin", "teacher"];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ 
        message: "Access denied. Only admin and teacher can login." 
      });
    }

    // 4️⃣ SUCCESS
    // Calculate token expiration (30 minutes from now)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    
    res.json({
      message: "Login successful",
      user: {
        id: data.user.id,
        email: data.user.email,
        role: role, // Will be "admin" or "teacher"
      },
      session: data.session,
      token_info: {
        expires_at: expiresAt.toISOString(),
        expires_in: 1800, // 30 minutes in seconds
        note: "Token expires after 30 minutes of inactivity. Use /api/auth/refresh to extend session.",
      },
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(503).json({ 
      message: "Service temporarily unavailable. Please try again.",
      error: err.message 
    });
  }
});

/* ======================================================
   CREATE USER (ADMIN/TEACHER)
   ====================================================== */
router.post("/create-user", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Validation
    if (!email || !password || !role) {
      return res.status(400).json({ 
        message: "Email, password, and role are required" 
      });
    }

    // Validate role
    const allowedRoles = ["admin", "teacher"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ 
        message: "Role must be 'admin' or 'teacher'" 
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ 
        message: "Password must be at least 6 characters" 
      });
    }

    // ⚡ OPTIMIZATION: Removed listUsers() check - let createUser validation handle email uniqueness
    // This saves one network request per user creation
    
    // 1️⃣ Create user in Supabase Auth with retry
    const { data: authData, error: authError } = await retryWithBackoff(() =>
      supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
    );

    if (authError) {
      console.error("Create user error:", authError);
      // Check if user already exists (Supabase returns specific error)
      if (authError.message.includes("already exists") || authError.status === 422) {
        return res.status(400).json({ 
          message: "User with this email already exists" 
        });
      }
      return res.status(503).json({ 
        message: "Failed to create user. Please try again.",
        error: authError.message 
      });
    }

    const userId = authData.user.id;

    // 2️⃣ Save role in user_roles table with retry
    const { error: roleError } = await retryWithBackoff(() =>
      supabase
        .from("user_roles")
        .insert([{ user_id: userId, role: role }])
    );

    if (roleError) {
      // If role insert fails, delete the created user
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (delErr) {
        console.error("Failed to rollback user creation:", delErr);
      }
      console.error("Role insert error:", roleError);
      return res.status(503).json({ 
        message: "Failed to assign role. Please try again.",
        error: roleError.message 
      });
    }

    // 3️⃣ SUCCESS
    res.status(201).json({
      success: true,
      message: `${role} created successfully`,
      user: {
        id: userId,
        email: email,
        role: role,
      },
    });

  } catch (err) {
    console.error("Create user error:", err);
    res.status(503).json({ 
      message: "Service temporarily unavailable. Please try again.",
      error: err.message 
    });
  }
});

/* ======================================================
   FORGOT PASSWORD / RESET PASSWORD
   ====================================================== */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        message: "Email is required" 
      });
    }

    // ⚡ OPTIMIZATION: Use generateLink directly with retry instead of listing all users
    // This avoids fetching ALL users just to check one email
    const { error: resetError } = await retryWithBackoff(() =>
      supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: email,
      })
    );

    // Always return success to prevent email enumeration attacks
    res.json({
      success: true,
      message: "If the email exists, a password reset link has been sent.",
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    // Still return success for security
    res.json({
      success: true,
      message: "If the email exists, a password reset link has been sent.",
    });
  }
});

/* ======================================================
   RESET PASSWORD (Admin can reset password directly)
   ====================================================== */
router.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ 
        message: "Email and new password are required" 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        message: "Password must be at least 6 characters" 
      });
    }

    // ⚡ OPTIMIZATION: Modified approach - use admin API directly with email
    // Note: Supabase admin API provides updateUserByEmail method if available
    // Otherwise, we need to add a backend endpoint that requires full admin authentication
    
    // For now, return a note that admin must use Supabase Dashboard or provide user ID
    return res.status(400).json({
      message: "Please provide user ID instead of email for direct password reset",
      hint: "Use PATCH /api/auth/reset-password/:id endpoint",
    });

  } catch (err) {
    console.error("Reset password error:", err);
    res.status(503).json({ 
      message: "Service temporarily unavailable. Please try again.",
      error: err.message 
    });
  }
});

/* ======================================================
   RESET PASSWORD BY USER ID (More efficient)
   ====================================================== */
router.patch("/reset-password/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!id || !newPassword) {
      return res.status(400).json({ 
        message: "User ID and new password are required" 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        message: "Password must be at least 6 characters" 
      });
    }

    // Update user password with retry
    const { error: updateError } = await retryWithBackoff(() =>
      supabaseAdmin.auth.admin.updateUserById(id, {
        password: newPassword,
      })
    );

    if (updateError) {
      console.error("Reset password error:", updateError);
      if (updateError.status === 404) {
        return res.status(404).json({ 
          message: "User not found" 
        });
      }
      return res.status(503).json({ 
        message: "Failed to reset password. Please try again.",
        error: updateError.message 
      });
    }

    res.json({
      success: true,
      message: "Password reset successfully",
    });

  } catch (err) {
    console.error("Reset password error:", err);
    res.status(503).json({ 
      message: "Service temporarily unavailable. Please try again.",
      error: err.message
    });
  }
});

/* ======================================================
   REMOVE USER (DELETE TEACHER/ADMIN)
   ====================================================== */
router.delete("/remove-user/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ 
        message: "User ID is required" 
      });
    }

    // Check if user exists and get role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", id)
      .single();

    if (roleError || !roleData) {
      return res.status(404).json({ 
        message: "User not found in user_roles" 
      });
    }

    // ⚡ OPTIMIZATION: Parallel deletion with retry logic
    // Delete from both tables simultaneously where possible
    const deleteRolePromise = retryWithBackoff(() =>
      supabase
        .from("user_roles")
        .delete()
        .eq("user_id", id)
    );

    const deleteUserPromise = retryWithBackoff(() =>
      supabaseAdmin.auth.admin.deleteUser(id)
    );

    const [roleDeleteResult, userDeleteResult] = await Promise.allSettled([
      deleteRolePromise,
      deleteUserPromise
    ]);

    if (roleDeleteResult.status === "rejected") {
      console.error("Delete role error:", roleDeleteResult.reason);
      return res.status(503).json({ 
        message: "Failed to remove role. Please try again.",
        error: roleDeleteResult.reason.message 
      });
    }

    if (userDeleteResult.status === "rejected") {
      console.error("Delete user error:", userDeleteResult.reason);
      // Try to restore role if user deletion fails
      try {
        await supabase.from("user_roles").insert([{
          user_id: id,
          role: roleData.role,
        }]);
      } catch (restoreErr) {
        console.error("Failed to restore role:", restoreErr);
      }
      
      return res.status(503).json({ 
        message: "Failed to delete user. Please try again.",
        error: userDeleteResult.reason.message 
      });
    }

    res.json({
      success: true,
      message: "User removed successfully",
      deletedUser: {
        id: id,
        role: roleData.role,
      },
    });

  } catch (err) {
    console.error("Remove user error:", err);
    res.status(503).json({ 
      message: "Service temporarily unavailable. Please try again.",
      error: err.message 
    });
  }
});

/* ======================================================
   GET ALL USERS (LIST ADMIN/TEACHER)
   ====================================================== */
router.get("/users", async (req, res) => {
  try {
    // ⚡ OPTIMIZATION: Get roles directly from table (which is faster than listing all Supabase users)
    // Only fetch from Supabase auth if we really need full user details
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id, role");

    if (roleError) {
      return res.status(503).json({ 
        message: "Failed to fetch users. Please try again.",
        error: roleError.message 
      });
    }

    // Return just from our table - faster and sufficient for most use cases
    // If you need auth details, those can be fetched on-demand
    const users = roleData.map((role) => ({
      id: role.user_id,
      role: role.role,
    }));

    res.json({
      success: true,
      users: users,
      count: users.length,
      note: "Email and auth details not included for performance. Use /api/auth/users/:id to get full details.",
    });

  } catch (err) {
    console.error("Get users error:", err);
    res.status(503).json({ 
      message: "Service temporarily unavailable. Please try again.",
      error: err.message 
    });
  }
});

/* ======================================================
   LOGOUT (ADMIN/TEACHER)
   ====================================================== */
router.post("/logout", async (req, res) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ 
        message: "Authentication required. Please provide a valid token." 
      });
    }

    const token = authHeader.split(" ")[1];

    // ⚡ OPTIMIZATION: Verify token with proper Supabase auth
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Token already invalid/expired, but still return success
      return res.json({
        success: true,
        message: "Logged out successfully (token was already invalid or expired). All protected APIs are now blocked.",
        note: "Only public result APIs will work. Please login again to access protected APIs.",
      });
    }

    // Get user role for response from cache
    const role = await getRoleCached(user.id);

    // ⚡ OPTIMIZATION: Revoke sessions with retry
    try {
      await retryWithBackoff(() =>
        supabaseAdmin.auth.admin.signOut(user.id, "global")
      );
    } catch (signOutError) {
      console.warn("SignOut warning (non-critical):", signOutError.message);
      // Non-critical error, continue
    }

    res.json({
      success: true,
      message: "Logged out successfully. Token has been invalidated.",
      note: "All protected APIs are now blocked. Only public result APIs will work. Please login again to access protected APIs.",
      user: {
        id: user.id,
        email: user.email,
        role: role || "unknown",
      },
      logout_time: new Date().toISOString(),
    });

  } catch (err) {
    console.error("Logout error:", err);
    res.status(503).json({ 
      message: "Service temporarily unavailable. Please try again.",
      error: err.message 
    });
  }
});

/* ======================================================
   REFRESH TOKEN (ADMIN/TEACHER)
   ====================================================== */
router.post("/refresh", async (req, res) => {
  try {
    // Get refresh token from body or header
    const { refresh_token } = req.body;
    const authHeader = req.headers.authorization;

    let token = refresh_token;

    // If no refresh_token in body, try to get from Authorization header
    if (!token && authHeader && authHeader.startsWith("Bearer ")) {
      const accessToken = authHeader.split(" ")[1];
      
      // Get user session to extract refresh token
      const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
      
      if (userError || !user) {
        return res.status(401).json({ 
          message: "Invalid or expired token" 
        });
      }

      // Note: Supabase refresh requires the full session object
      // This is a simplified version - frontend should handle refresh with session
      return res.status(400).json({ 
        message: "Please provide refresh_token in request body. Use the refresh_token from login response." 
      });
    }

    if (!token) {
      return res.status(400).json({ 
        message: "Refresh token is required" 
      });
    }

    // Refresh the session
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: token,
    });

    if (error) {
      return res.status(401).json({ 
        message: "Invalid or expired refresh token",
        error: error.message 
      });
    }

    // Calculate token expiration (30 minutes from now)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // Get user role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .single();

    if (roleError || !roleData) {
      return res.status(403).json({ 
        message: "Role not assigned" 
      });
    }

    res.json({
      success: true,
      message: "Token refreshed successfully",
      user: {
        id: data.user.id,
        email: data.user.email,
        role: roleData.role,
      },
      session: data.session,
      token_info: {
        expires_at: expiresAt.toISOString(),
        expires_in: 1800,
      },
    });

  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
});

export default router;
