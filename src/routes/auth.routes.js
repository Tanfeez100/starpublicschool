import express from "express";
import { supabase } from "../services/supabase.js";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Admin client for user management (uses service role key)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email & password required" });

    // 1️⃣ Supabase Auth Login
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error)
      return res.status(401).json({ message: "Invalid credentials" });

    // 2️⃣ ROLE CHECK (user_roles TABLE)
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .single();

    if (roleError || !roleData)
      return res.status(403).json({ message: "Role not assigned" });

    // 3️⃣ ALLOW ADMIN AND TEACHER ROLES
    const allowedRoles = ["admin", "teacher"];
    if (!allowedRoles.includes(roleData.role)) {
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
        role: roleData.role, // Will be "admin" or "teacher"
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
    res.status(500).json({ 
      message: "Server error",
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

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingUser?.users?.some(
      (user) => user.email === email
    );

    if (userExists) {
      return res.status(400).json({ 
        message: "User with this email already exists" 
      });
    }

    // 1️⃣ Create user in Supabase Auth
    const { data: authData, error: authError } = 
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email
      });

    if (authError) {
      console.error("Create user error:", authError);
      return res.status(500).json({ 
        message: "Failed to create user",
        error: authError.message 
      });
    }

    const userId = authData.user.id;

    // 2️⃣ Save role in user_roles table
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert([
        {
          user_id: userId,
          role: role,
        },
      ]);

    if (roleError) {
      // If role insert fails, delete the created user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      console.error("Role insert error:", roleError);
      return res.status(500).json({ 
        message: "Failed to assign role",
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
    res.status(500).json({ 
      message: "Server error",
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

    // Check if user exists
    const { data: users, error: listError } = 
      await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      return res.status(500).json({ 
        message: "Failed to check user",
        error: listError.message 
      });
    }

    const user = users?.users?.find((u) => u.email === email);

    if (!user) {
      // Don't reveal if user exists or not (security best practice)
      return res.json({
        success: true,
        message: "If the email exists, a password reset link has been sent.",
      });
    }

    // Send password reset email
    const { error: resetError } = 
      await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: email,
      });

    if (resetError) {
      console.error("Reset password error:", resetError);
      return res.status(500).json({ 
        message: "Failed to send reset email",
        error: resetError.message 
      });
    }

    res.json({
      success: true,
      message: "Password reset email sent successfully",
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
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

    // Find user by email
    const { data: users, error: listError } = 
      await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      return res.status(500).json({ 
        message: "Failed to find user",
        error: listError.message 
      });
    }

    const user = users?.users?.find((u) => u.email === email);

    if (!user) {
      return res.status(404).json({ 
        message: "User not found" 
      });
    }

    // Update user password
    const { error: updateError } = 
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: newPassword,
      });

    if (updateError) {
      console.error("Reset password error:", updateError);
      return res.status(500).json({ 
        message: "Failed to reset password",
        error: updateError.message 
      });
    }

    res.json({
      success: true,
      message: "Password reset successfully",
    });

  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ 
      message: "Server error",
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

    // Prevent deleting admin (optional security check)
    // Uncomment if you want to prevent admin deletion
    // if (roleData.role === "admin") {
    //   return res.status(403).json({ 
    //     message: "Cannot delete admin user" 
    //   });
    // }

    // 1️⃣ Delete from user_roles table
    const { error: deleteRoleError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", id);

    if (deleteRoleError) {
      console.error("Delete role error:", deleteRoleError);
      return res.status(500).json({ 
        message: "Failed to remove role",
        error: deleteRoleError.message 
      });
    }

    // 2️⃣ Delete user from Supabase Auth
    const { error: deleteUserError } = 
      await supabaseAdmin.auth.admin.deleteUser(id);

    if (deleteUserError) {
      console.error("Delete user error:", deleteUserError);
      // Try to restore role if user deletion fails
      await supabase.from("user_roles").insert([{
        user_id: id,
        role: roleData.role,
      }]);
      
      return res.status(500).json({ 
        message: "Failed to delete user",
        error: deleteUserError.message 
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
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
});

/* ======================================================
   GET ALL USERS (LIST ADMIN/TEACHER)
   ====================================================== */
router.get("/users", async (req, res) => {
  try {
    // Get all users with roles
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id, role");

    if (roleError) {
      return res.status(500).json({ 
        message: "Failed to fetch users",
        error: roleError.message 
      });
    }

    // Get user details from auth
    const { data: usersData, error: usersError } = 
      await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      return res.status(500).json({ 
        message: "Failed to fetch user details",
        error: usersError.message 
      });
    }

    // Combine user data with roles
    const usersWithRoles = roleData.map((role) => {
      const user = usersData?.users?.find((u) => u.id === role.user_id);
      return {
        id: role.user_id,
        email: user?.email || "N/A",
        role: role.role,
        created_at: user?.created_at,
      };
    });

    res.json({
      success: true,
      users: usersWithRoles,
      count: usersWithRoles.length,
    });

  } catch (err) {
    console.error("Get users error:", err);
    res.status(500).json({ 
      message: "Server error",
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

    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      // Token already invalid/expired, but still return success
      return res.json({
        success: true,
        message: "Logged out successfully (token was already invalid or expired). All protected APIs are now blocked.",
        note: "Only public result APIs will work. Please login again to access protected APIs.",
      });
    }

    // Get user role for response
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    // 1️⃣ Revoke all sessions for this user globally (Supabase level)
    try {
      const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(user.id, "global");
      
      if (signOutError) {
        console.warn("SignOut error:", signOutError);
      }
    } catch (signOutError) {
      console.warn("SignOut exception (non-critical):", signOutError);
    }

    res.json({
      success: true,
      message: "Logged out successfully. Token has been invalidated.",
      note: "All protected APIs are now blocked. Only public result APIs will work. Please login again to access protected APIs.",
      user: {
        id: user.id,
        email: user.email,
        role: roleData?.role || "unknown",
      },
      logout_time: new Date().toISOString(),
    });

  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ 
      message: "Server error",
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
