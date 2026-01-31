import { supabase } from "../services/supabase.js";

/**
 * Authentication Middleware
 * Verifies JWT token with Supabase
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ 
        message: "Authentication required. Please provide a valid token." 
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ 
        message: "Invalid or expired token. Please login again.",
        error: "AUTHENTICATION_REQUIRED",
        note: "This API requires authentication. Only public result APIs are accessible without login."
      });
    }

    // Get user role from user_roles table
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleError || !roleData) {
      return res.status(403).json({ 
        message: "Role not assigned. Contact administrator." 
      });
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: roleData.role, // "admin" or "teacher"
    };

    next();
  } catch (err) {
    console.error("Authentication error:", err);
    res.status(500).json({ 
      message: "Authentication failed",
      error: err.message 
    });
  }
};

/**
 * Authorization Middleware
 * Checks if user has required role(s)
 * @param {string[]} allowedRoles - Array of allowed roles (e.g., ["admin", "teacher"])
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: "Authentication required" 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Access denied. Required role: ${allowedRoles.join(" or ")}` 
      });
    }

    next();
  };
};

/**
 * Admin Only Middleware
 * Only admin can access
 */
export const adminOnly = [authenticate, authorize("admin")];

/**
 * Teacher Only Middleware
 * Only teacher can access
 */
export const teacherOnly = [authenticate, authorize("teacher")];

/**
 * Admin or Teacher Middleware
 * Both admin and teacher can access
 */
export const adminOrTeacher = [authenticate, authorize("admin", "teacher")];

