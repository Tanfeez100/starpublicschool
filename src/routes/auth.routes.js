import express from "express";
import { supabase, supabaseAuth, getRoleCached, getAppJwtSecret } from "../services/supabase.js";
import { createClient } from "@supabase/supabase-js";
import { adminOnly } from "../middleware/auth.middleware.js";
import jwt from "jsonwebtoken";

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

const APP_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const APP_SESSION_TTL_MS = APP_SESSION_TTL_SECONDS * 1000;
const buildAppAccessToken = (user = {}, assignments = []) => {
  const jwtSecret = getAppJwtSecret();
  if (!jwtSecret) {
    throw new Error("JWT secret not configured for app session signing.");
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email || null,
      role: user.role || null,
      assignedClass: user.assignedClass || null,
      assignedSection: user.assignedSection || null,
      academicYear: user.academicYear || null,
      assignments,
    },
    jwtSecret,
    { expiresIn: APP_SESSION_TTL_SECONDS }
  );
};

const router = express.Router();
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createHttpError = (status, message, detail = null) => {
  const err = new Error(message);
  err.status = status;
  if (detail) {
    err.detail = detail;
  }
  return err;
};

const normalizeRole = (role) => String(role || "").trim().toLowerCase();
const sanitizeString = (value) => (typeof value === "string" ? value.trim() : value);
const isValidUuid = (value) => UUID_REGEX.test(String(value || ""));
const isSchemaMissing = (error) => {
  const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return text.includes("schema cache") || text.includes("pgrst205") || text.includes("could not find the table") || text.includes("relation");
};

const generateTemporaryPassword = () =>
  `Sps@${Math.random().toString(36).slice(2, 8)}${Math.floor(100 + Math.random() * 900)}`;

const generateUsername = ({ fullName = "", employeeId = "", email = "" } = {}) => {
  const source = employeeId || fullName || email.split("@")[0] || "teacher";
  const slug = String(source)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 24);
  return `${slug || "teacher"}.${Math.floor(1000 + Math.random() * 9000)}`;
};

const getDefaultAcademicYear = () => {
  const now = new Date();
  const currentYear = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  return `${currentYear}-${String(currentYear + 1).slice(-2)}`;
};

const normalizeAcademicYear = (value) => {
  const normalized = sanitizeString(value);
  if (!normalized) return getDefaultAcademicYear();
  if (!/^\d{4}-(\d{2}|\d{4})$/.test(normalized)) {
    throw createHttpError(400, "academic_year must be in format YYYY-YY or YYYY-YYYY");
  }
  return normalized;
};

const getTeacherAssignmentMap = async (teacherIds = []) => {
  if (!teacherIds.length) return new Map();

  const { data, error } = await supabase
    .from("teacher_assignments")
    .select("teacher_id, class, section, academic_year, created_at, updated_at")
    .in("teacher_id", teacherIds)
    .order("class", { ascending: true })
    .order("section", { ascending: true });

  if (error) {
    console.warn("Teacher assignment fetch skipped:", error.message);
    return new Map();
  }

  return (data || []).reduce((map, row) => {
    const rows = map.get(row.teacher_id) || [];
    rows.push(row);
    map.set(row.teacher_id, rows);
    return map;
  }, new Map());
};

const getTeacherProfileMap = async (teacherIds = []) => {
  if (!teacherIds.length) return new Map();

  const { data, error } = await supabase
    .from("teacher_profiles")
    .select("*")
    .in("id", teacherIds);

  if (error) {
    if (isSchemaMissing(error)) {
      console.warn("teacher_profiles table not visible yet:", error.message);
      return new Map();
    }
    throw error;
  }

  return (data || []).reduce((map, row) => {
    map.set(row.id, row);
    return map;
  }, new Map());
};

const resolveTeacherEmailForLogin = async (identity) => {
  const normalized = sanitizeString(identity);
  if (!normalized || normalized.includes("@")) return normalized;

  const { data, error } = await supabase
    .from("teacher_profiles")
    .select("email, status")
    .eq("username", normalized)
    .maybeSingle();

  if (error) {
    if (isSchemaMissing(error)) return normalized;
    throw error;
  }

  if (data?.status === "inactive") {
    throw createHttpError(403, "Inactive teachers cannot login.");
  }

  return data?.email || normalized;
};

const ensureTeacherProfileCanLogin = async (teacherId) => {
  const { data, error } = await supabase
    .from("teacher_profiles")
    .select("status")
    .eq("id", teacherId)
    .maybeSingle();

  if (error) {
    if (isSchemaMissing(error)) return;
    throw error;
  }

  if (data?.status === "inactive") {
    throw createHttpError(403, "Inactive teachers cannot login.");
  }
};

const upsertTeacherProfile = async ({ teacherId, payload = {}, email, actorId }) => {
  const fullName = sanitizeString(payload.full_name || payload.fullName || payload.name) || "";
  const employeeId = sanitizeString(payload.employee_id || payload.employeeId) || null;
  const username = sanitizeString(payload.username) || generateUsername({ fullName, employeeId, email });
  const profile = {
    id: teacherId,
    employee_id: employeeId,
    full_name: fullName || email,
    mobile: sanitizeString(payload.mobile) || null,
    email,
    gender: sanitizeString(payload.gender) || null,
    date_of_birth: sanitizeString(payload.date_of_birth || payload.dateOfBirth) || null,
    qualification: sanitizeString(payload.qualification) || null,
    designation: sanitizeString(payload.designation) || null,
    department: sanitizeString(payload.department) || null,
    joining_date: sanitizeString(payload.joining_date || payload.joiningDate) || null,
    address: sanitizeString(payload.address) || null,
    emergency_contact: sanitizeString(payload.emergency_contact || payload.emergencyContact) || null,
    photo_url: sanitizeString(payload.photo_url || payload.photoUrl) || null,
    status: sanitizeString(payload.status) || "active",
    username,
    must_reset_password: true,
    created_by: actorId || null,
    updated_by: actorId || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("teacher_profiles")
    .upsert([profile], { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    if (isSchemaMissing(error)) {
      console.warn("teacher profile save skipped:", error.message);
      return null;
    }
    throw error;
  }

  return data;
};

const ensureTeacherRole = async (teacherId) => {
  if (!isValidUuid(teacherId)) {
    throw createHttpError(400, "Valid teacher ID is required");
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("user_id", teacherId)
    .eq("role", "teacher")
    .single();

  if (error || !data) {
    throw createHttpError(404, "Teacher not found");
  }

  return data;
};

const createManagedUser = async ({ email, password, role }) => {
  if (!email || !password || !role) {
    throw createHttpError(400, "Email, password, and role are required");
  }

  const normalizedRole = normalizeRole(role);
  const allowedRoles = ["admin", "teacher"];

  if (!allowedRoles.includes(normalizedRole)) {
    throw createHttpError(400, "Role must be 'admin' or 'teacher'");
  }

  if (String(password).length < 6) {
    throw createHttpError(400, "Password must be at least 6 characters");
  }

  const { data: authData, error: authError } = await retryWithBackoff(() =>
    supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
  );

  if (authError) {
    if (
      (authError.message || "").toLowerCase().includes("already exists") ||
      authError.status === 422
    ) {
      throw createHttpError(400, "User with this email already exists");
    }

    throw createHttpError(
      503,
      "Failed to create user. Please try again.",
      authError.message
    );
  }

  const userId = authData?.user?.id;
  if (!userId) {
    throw createHttpError(503, "Failed to create user. Missing user ID.");
  }

  const { error: roleError } = await retryWithBackoff(() =>
    supabase.from("user_roles").insert([{ user_id: userId, role: normalizedRole }])
  );

  if (roleError) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    } catch (rollbackError) {
      console.error("Failed to rollback user creation:", rollbackError);
    }

    throw createHttpError(
      503,
      "Failed to assign role. Please try again.",
      roleError.message
    );
  }

  return {
    id: userId,
    email,
    role: normalizedRole,
  };
};

const deleteManagedUser = async ({ userId, requiredRole = null, actorUserId = null }) => {
  if (!userId) {
    throw createHttpError(400, "User ID is required");
  }

  if (actorUserId && actorUserId === userId) {
    throw createHttpError(400, "You cannot remove your own account");
  }

  const { data: roleData, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (roleError || !roleData) {
    throw createHttpError(404, "User not found in user_roles");
  }

  const existingRole = normalizeRole(roleData.role);

  if (requiredRole && existingRole !== requiredRole) {
    throw createHttpError(400, `Only '${requiredRole}' accounts can be removed here`);
  }

  const deleteRolePromise = retryWithBackoff(() =>
    supabase.from("user_roles").delete().eq("user_id", userId)
  );

  const deleteUserPromise = retryWithBackoff(() =>
    supabaseAdmin.auth.admin.deleteUser(userId)
  );

  const [roleDeleteResult, userDeleteResult] = await Promise.allSettled([
    deleteRolePromise,
    deleteUserPromise,
  ]);

  if (roleDeleteResult.status === "rejected") {
    throw createHttpError(
      503,
      "Failed to remove role. Please try again.",
      roleDeleteResult.reason?.message || "Role deletion failed"
    );
  }

  if (userDeleteResult.status === "rejected") {
    try {
      await supabase.from("user_roles").insert([{ user_id: userId, role: existingRole }]);
    } catch (restoreErr) {
      console.error("Failed to restore role:", restoreErr);
    }

    throw createHttpError(
      503,
      "Failed to delete user. Please try again.",
      userDeleteResult.reason?.message || "Auth user deletion failed"
    );
  }

  return { id: userId, role: existingRole };
};

router.post("/login", async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const identity = email || username;

    if (!identity || !password)
      return res.status(400).json({ message: "Email & password required" });

    const resolvedEmail = await resolveTeacherEmailForLogin(identity);

    // ⚡ OPTIMIZATION: Add retry logic for network resilience
    const { data, error } = await retryWithBackoff(() => 
      supabaseAuth.auth.signInWithPassword({ email: resolvedEmail, password })
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
    // App login remains valid for 30 days.
    if (role === "teacher") {
      await ensureTeacherProfileCanLogin(data.user.id);
    }

    const expiresAt = new Date(Date.now() + APP_SESSION_TTL_MS);
    const assignments =
      role === "teacher"
        ? (await getTeacherAssignmentMap([data.user.id])).get(data.user.id) || []
        : [];
    const assignment = assignments[0] || null;
    const appAccessToken = buildAppAccessToken(
      {
        id: data.user.id,
        email: data.user.email,
        role,
        assignedClass: assignment?.class || null,
        assignedSection: assignment?.section || null,
        academicYear: assignment?.academic_year || null,
      },
      assignments
    );
    const appSession = {
      ...(data.session || {}),
      access_token: appAccessToken,
      refresh_token: data.session?.refresh_token || "",
    };
    
    res.json({
      message: "Login successful",
      access_token: appAccessToken,
      refresh_token: appSession.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: role, // Will be "admin" or "teacher"
        assignedClass: assignment?.class || null,
        assignedSection: assignment?.section || null,
        academicYear: assignment?.academic_year || null,
        assignments,
      },
      session: appSession,
      token_info: {
        expires_at: expiresAt.toISOString(),
        expires_in: APP_SESSION_TTL_SECONDS,
        note: "Login expires after 30 days. Use /api/auth/refresh to extend session.",
      },
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(err.status || 503).json({ 
      message: err.message || "Service temporarily unavailable. Please try again.",
      error: err.message 
    });
  }
});

/* ======================================================
   CREATE USER (ADMIN/TEACHER)
   ====================================================== */
router.post("/create-user", adminOnly, async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const createdUser = await createManagedUser({ email, password, role });

    res.status(201).json({
      success: true,
      message: `${createdUser.role} created successfully`,
      user: createdUser,
    });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(err.status || 503).json({
      message: err.message || "Service temporarily unavailable. Please try again.",
      ...(err.detail ? { error: err.detail } : {}),
    });
  }
});

/* ======================================================
   ADMIN TEACHER MANAGEMENT
   ====================================================== */
router.post("/teachers", adminOnly, async (req, res) => {
  try {
    const { email } = req.body;
    const password = req.body.password || generateTemporaryPassword();
    const createdTeacher = await createManagedUser({
      email,
      password,
      role: "teacher",
    });
    const profile = await upsertTeacherProfile({
      teacherId: createdTeacher.id,
      payload: req.body,
      email,
      actorId: req.user?.id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Teacher created successfully",
      teacher: {
        ...createdTeacher,
        profile,
        username: profile?.username || null,
        temporaryPassword: password,
      },
    });
  } catch (err) {
    console.error("Create teacher error:", err);
    return res.status(err.status || 503).json({
      message: err.message || "Service temporarily unavailable. Please try again.",
      ...(err.detail ? { error: err.detail } : {}),
    });
  }
});

router.get("/teachers", adminOnly, async (req, res) => {
  try {
    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("role", "teacher")
      .order("user_id", { ascending: true });

    if (roleError) {
      return res.status(503).json({
        message: "Failed to fetch teachers. Please try again.",
        error: roleError.message,
      });
    }

    const teacherIds = (roleRows || []).map((row) => row.user_id);
    const teacherIdSet = new Set(teacherIds);
    const emailById = new Map();

    if (teacherIds.length > 0) {
      const { data: listData, error: listError } = await retryWithBackoff(() =>
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      );

      if (!listError && listData?.users?.length) {
        for (const authUser of listData.users) {
          if (teacherIdSet.has(authUser.id)) {
            emailById.set(authUser.id, authUser.email || null);
          }
        }
      }
    }

    const teachers = (roleRows || []).map((row) => ({
      id: row.user_id,
      role: "teacher",
      email: emailById.get(row.user_id) || null,
    }));
    const assignmentByTeacherId = await getTeacherAssignmentMap(teacherIds);
    const profileByTeacherId = await getTeacherProfileMap(teacherIds);
    const teachersWithAssignments = teachers.map((teacher) => {
      const assignments = assignmentByTeacherId.get(teacher.id) || [];
      const assignment = assignments[0] || null;
      const profile = profileByTeacherId.get(teacher.id) || null;
      return {
        ...teacher,
        profile,
        employeeId: profile?.employee_id || "",
        fullName: profile?.full_name || "",
        mobile: profile?.mobile || "",
        username: profile?.username || "",
        status: profile?.status || "active",
        assignment,
        assignments,
        assignedClass: assignment?.class || null,
        assignedSection: assignment?.section || null,
        academicYear: assignment?.academic_year || null,
      };
    });

    return res.json({
      success: true,
      count: teachersWithAssignments.length,
      teachers: teachersWithAssignments,
    });
  } catch (err) {
    console.error("Get teachers error:", err);
    return res.status(503).json({
      message: "Service temporarily unavailable. Please try again.",
      error: err.message,
    });
  }
});

const saveTeacherAssignment = async (req, res) => {
  try {
    const teacherId = req.params.id;
    const assignedClass = sanitizeString(req.body?.class || req.body?.assignedClass);
    const assignedSection = sanitizeString(req.body?.section || req.body?.assignedSection);
    const academicYear = normalizeAcademicYear(req.body?.academic_year || req.body?.academicYear);

    if (!assignedClass || !assignedSection) {
      return res.status(400).json({
        message: "class and section are required",
      });
    }

    await ensureTeacherRole(teacherId);

    const { data: occupiedAssignment, error: occupiedError } = await supabase
      .from("teacher_assignments")
      .select("teacher_id, class, section, academic_year")
      .eq("class", assignedClass)
      .eq("section", assignedSection)
      .eq("academic_year", academicYear)
      .neq("teacher_id", teacherId)
      .limit(1);

    if (occupiedError) {
      return res.status(500).json({
        message: "Failed to check existing teacher assignment",
        error: occupiedError.message,
      });
    }

    if (Array.isArray(occupiedAssignment) && occupiedAssignment.length > 0) {
      return res.status(409).json({
        message: `Class ${assignedClass} section ${assignedSection} is already assigned for ${academicYear}`,
      });
    }

    const assignmentPayload = {
      class: assignedClass,
      section: assignedSection,
      academic_year: academicYear,
      updated_at: new Date().toISOString(),
    };

    const { data: existingAssignment, error: existingError } = await supabase
      .from("teacher_assignments")
      .select("teacher_id, class, section, academic_year")
      .eq("teacher_id", teacherId)
      .eq("class", assignedClass)
      .eq("section", assignedSection)
      .eq("academic_year", academicYear)
      .limit(1);

    if (existingError) {
      return res.status(500).json({
        message: "Failed to check previous teacher assignment",
        error: existingError.message,
      });
    }

    const hasExistingAssignment = Array.isArray(existingAssignment) && existingAssignment.length > 0;
    const assignmentQuery = hasExistingAssignment
      ? supabase
          .from("teacher_assignments")
          .update(assignmentPayload)
          .eq("teacher_id", teacherId)
          .eq("class", assignedClass)
          .eq("section", assignedSection)
          .eq("academic_year", academicYear)
          .select("teacher_id, class, section, academic_year, created_at, updated_at")
          .single()
      : supabase
          .from("teacher_assignments")
          .insert([
            {
              teacher_id: teacherId,
              ...assignmentPayload,
            },
          ])
          .select("teacher_id, class, section, academic_year, created_at, updated_at")
          .single();

    const { data: assignment, error } = await assignmentQuery;

    if (error) {
      const isDuplicate = error.code === "23505" || /duplicate key/i.test(error.message || "");
      if (isDuplicate) {
        return res.status(409).json({
          message: `Class ${assignedClass} section ${assignedSection} is already assigned for ${academicYear}`,
        });
      }

      return res.status(500).json({
        message: "Failed to save teacher assignment",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: hasExistingAssignment ? "Teacher assignment already saved" : "Teacher assigned successfully",
      assignment,
    });
  } catch (err) {
    console.error("Teacher assignment error:", err);
    return res.status(err.status || 500).json({
      message: err.message || "Failed to save teacher assignment",
      ...(err.detail ? { error: err.detail } : {}),
    });
  }
};

router.post("/teachers/:id/assignment", adminOnly, saveTeacherAssignment);
router.patch("/teachers/:id/assignment", adminOnly, saveTeacherAssignment);

router.delete("/teachers/:id/assignment", adminOnly, async (req, res) => {
  try {
    const teacherId = req.params.id;
    await ensureTeacherRole(teacherId);
    const assignedClass = sanitizeString(req.query?.class || req.query?.assignedClass);
    const assignedSection = sanitizeString(req.query?.section || req.query?.assignedSection);
    const academicYear = req.query?.academic_year || req.query?.academicYear
      ? normalizeAcademicYear(req.query?.academic_year || req.query?.academicYear)
      : "";

    let query = supabase
      .from("teacher_assignments")
      .delete()
      .eq("teacher_id", teacherId);

    if (assignedClass) query = query.eq("class", assignedClass);
    if (assignedSection) query = query.eq("section", assignedSection);
    if (academicYear) query = query.eq("academic_year", academicYear);

    const { error } = await query;

    if (error) {
      return res.status(500).json({
        message: "Failed to remove teacher assignment",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Teacher assignment removed",
    });
  } catch (err) {
    console.error("Remove teacher assignment error:", err);
    return res.status(err.status || 500).json({
      message: err.message || "Failed to remove teacher assignment",
    });
  }
});

router.delete("/teachers/:id", adminOnly, async (req, res) => {
  try {
    const deletedTeacher = await deleteManagedUser({
      userId: req.params.id,
      requiredRole: "teacher",
      actorUserId: req.user?.id || null,
    });

    return res.json({
      success: true,
      message: "Teacher removed successfully",
      deletedTeacher,
    });
  } catch (err) {
    console.error("Remove teacher error:", err);
    return res.status(err.status || 503).json({
      message: err.message || "Service temporarily unavailable. Please try again.",
      ...(err.detail ? { error: err.detail } : {}),
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
router.post("/reset-password", adminOnly, async (req, res) => {
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
router.patch("/reset-password/:id", adminOnly, async (req, res) => {
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
router.delete("/remove-user/:id", adminOnly, async (req, res) => {
  try {
    const deletedUser = await deleteManagedUser({
      userId: req.params.id,
      actorUserId: req.user?.id || null,
    });

    res.json({
      success: true,
      message: "User removed successfully",
      deletedUser,
    });
  } catch (err) {
    console.error("Remove user error:", err);
    res.status(err.status || 503).json({
      message: err.message || "Service temporarily unavailable. Please try again.",
      ...(err.detail ? { error: err.detail } : {}),
    });
  }
});
/* ======================================================
   GET ALL USERS (LIST ADMIN/TEACHER)
   ====================================================== */
router.get("/users", adminOnly, async (req, res) => {
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
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

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
      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(accessToken);
      
      if (userError || !user) {
        return res.status(401).json({ 
          message: "Login expired. Please login again." 
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
    const { data, error } = await supabaseAuth.auth.refreshSession({
      refresh_token: token,
    });

    if (error) {
      return res.status(401).json({ 
        message: "Login expired. Please login again.",
        error: error.message 
      });
    }

    // App login remains valid for 30 days after refresh.
    const expiresAt = new Date(Date.now() + APP_SESSION_TTL_MS);

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
    const assignments =
      roleData.role === "teacher"
        ? (await getTeacherAssignmentMap([data.user.id])).get(data.user.id) || []
        : [];
    const assignment = assignments[0] || null;
    const appAccessToken = buildAppAccessToken(
      {
        id: data.user.id,
        email: data.user.email,
        role: roleData.role,
        assignedClass: assignment?.class || null,
        assignedSection: assignment?.section || null,
        academicYear: assignment?.academic_year || null,
      },
      assignments
    );
    const appSession = {
      ...(data.session || {}),
      access_token: appAccessToken,
      refresh_token: data.session?.refresh_token || "",
    };

    res.json({
      success: true,
      message: "Token refreshed successfully",
      access_token: appAccessToken,
      refresh_token: appSession.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: roleData.role,
        assignedClass: assignment?.class || null,
        assignedSection: assignment?.section || null,
        academicYear: assignment?.academic_year || null,
        assignments,
      },
      session: appSession,
      token_info: {
        expires_at: expiresAt.toISOString(),
        expires_in: APP_SESSION_TTL_SECONDS,
        note: "Login expires after 30 days. Use /api/auth/refresh to extend session.",
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


