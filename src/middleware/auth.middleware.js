import { supabase, verifyToken, getRoleCached, getAppJwtSecret } from "../services/supabase.js";
import jwt from "jsonwebtoken";

/**
 * Retry wrapper for auth operations
 */
const retryAuth = async (fn, maxRetries = 2) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
      }
    }
  }
  throw lastError;
};

/**
 * Authentication Middleware - OPTIMIZED
 * Verifies JWT token with Supabase
 * Caches user roles to reduce database queries
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
    const jwtSecret = getAppJwtSecret();

    if (jwtSecret) {
      try {
        const decoded = jwt.verify(token, jwtSecret);
        if (["student", "admin", "teacher"].includes(decoded?.role)) {
          req.user = {
            id: decoded.id || decoded.sub,
            email: decoded.email || null,
            role: decoded.role,
            class: decoded.class || null,
            section: decoded.section || null,
            name: decoded.name || null,
            rollNo: decoded.rollNo || decoded.roll_no || null,
            assignedClass: decoded.assignedClass || null,
            assignedSection: decoded.assignedSection || null,
            academicYear: decoded.academicYear || null,
            assignments: Array.isArray(decoded.assignments) ? decoded.assignments : [],
          };
          return next();
        }
      } catch {
        // Fall through to Supabase token verification for staff accounts.
      }
    }

    // ⚡ OPTIMIZATION: Verify token with retry logic
    const tokenVerification = await retryAuth(() => verifyToken(token));
    
    if (!tokenVerification.valid) {
      return res.status(401).json({ 
        message: "Invalid or expired token. Please login again.",
        error: "AUTHENTICATION_REQUIRED",
        note: "This API requires authentication. Only public result APIs are accessible without login."
      });
    }

    const user = tokenVerification.user;

    // ⚡ OPTIMIZATION: Get role from cache if available
    const role = await getRoleCached(user.id);

    if (!role) {
      return res.status(403).json({ 
        message: "Role not assigned. Contact administrator." 
      });
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: role, // "admin" or "teacher"
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

export const adminTeacherOrStudent = [authenticate, authorize("admin", "teacher", "student")];
